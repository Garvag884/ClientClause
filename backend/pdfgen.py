from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

_SWAPS = {"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
          "\u2013": "-", "\u2014": "-", "\u20b9": "Rs. ", "\u2026": "..."}


def clean(text):
    t = str(text or "")
    for a, b in _SWAPS.items():
        t = t.replace(a, b)
    return t.encode("latin-1", "replace").decode("latin-1")


def ptext(text):
    return escape(clean(text)).replace("\n", "<br/>")


def faded_logo(path, opacity=0.07):
    try:
        from PIL import Image
        im = Image.open(path).convert("RGBA")
        alpha = im.split()[3].point(lambda v: int(v * opacity))
        im.putalpha(alpha)
        buf = BytesIO()
        im.save(buf, "PNG")
        buf.seek(0)
        return ImageReader(buf), im.size
    except Exception:
        return None, None


def build_pdf(data, logo_path):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm,
                            topMargin=22 * mm, bottomMargin=20 * mm,
                            title=clean(data["type_name"]), author="ClientClause")
    base = ParagraphStyle("base", fontName="Times-Roman", fontSize=11, leading=15.5)
    body = ParagraphStyle("body", parent=base, alignment=TA_JUSTIFY, spaceAfter=6)
    head = ParagraphStyle("head", parent=base, fontName="Times-Bold", spaceBefore=8,
                          spaceAfter=3, keepWithNext=1)
    title = ParagraphStyle("title", parent=base, fontName="Times-Bold", fontSize=15,
                           leading=20, alignment=TA_CENTER, spaceAfter=14)
    small = ParagraphStyle("small", parent=base, fontSize=10.5, leading=15)
    logo, size = faded_logo(logo_path)
    width = A4[0] - 44 * mm

    def page(canvas, d):
        canvas.saveState()
        if logo:
            w = 130 * mm
            h = w * size[1] / size[0]
            canvas.drawImage(logo, (A4[0] - w) / 2, (A4[1] - h) / 2, w, h, mask="auto")
        canvas.setFont("Times-Roman", 8.5)
        canvas.setFillColor(colors.HexColor("#777777"))
        canvas.drawCentredString(A4[0] / 2, 10 * mm,
            "Page %d  |  Drafted with ClientClause. A drafting aid, not legal advice." % d.page)
        canvas.restoreState()

    def boxes(items, blank_height):
        n = len(items)
        gap = 8 * mm
        col = (width - gap * (n - 1)) / n
        heads, blanks, widths = [], [], []
        for i, it in enumerate(items):
            if i:
                heads.append("")
                blanks.append("")
                widths.append(gap)
            heads.append(Paragraph("<b>%s</b>" % ptext(it["head"]), small))
            blanks.append("")
            widths.append(col)
        rows = [heads, blanks]
        for k in range(len(items[0]["lines"])):
            row = []
            for i, it in enumerate(items):
                if i:
                    row.append("")
                row.append(Paragraph(ptext(it["lines"][k]), small))
            rows.append(row)
        t = Table(rows, colWidths=widths, rowHeights=[None, blank_height] + [None] * (len(rows) - 2))
        style = [("VALIGN", (0, 0), (-1, -1), "TOP"),
                 ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]
        for i in range(n):
            ci = i * 2
            style.append(("LINEBELOW", (ci, 1), (ci, 1), 0.8, colors.black))
        t.setStyle(TableStyle(style))
        return t

    story = [Paragraph(ptext(data["type_name"].upper()), title)]
    for p in data["preamble"]:
        story.append(Paragraph(ptext(p), body))
    for c in data["clauses"]:
        story.append(Paragraph("%d. %s" % (c["number"], ptext(c["title"])), head))
        story.append(Paragraph(ptext(c["text"]), body))

    g = data["signature"]
    parties = [{"head": "Signed by the " + p["role"],
                "lines": ["Name: " + p["name"], "Date: " + g["date"], "Place: " + g["place"]]}
               for p in g["parties"]]
    block = [Spacer(1, 6 * mm), Paragraph(ptext(g["closing"]), body), Spacer(1, 3 * mm)]
    if parties:
        block.append(boxes(parties, 16 * mm))
    if g.get("witnesses"):
        wit = [{"head": "Witness %d" % (i + 1), "lines": ["Name:", "Address:"]}
               for i in range(g["witnesses"])]
        block += [Spacer(1, 6 * mm), Paragraph("<b>Witnesses</b>", small), boxes(wit, 14 * mm)]
    story.append(KeepTogether(block))

    doc.build(story, onFirstPage=page, onLaterPages=page)
    return buf.getvalue()
