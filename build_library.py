import glob
import json
import re
import datetime

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

ORDER = ["rental", "freelance", "employment", "nda", "mutual_nda", "supply", "loan"]
FONT = "Times New Roman"
GREY = RGBColor(0x55, 0x55, 0x55)


def show(text):
    return re.sub(r"\{\{(\w+?)(?:_legal)?\}\}", lambda m: "[" + m.group(1).replace("_", " ") + "]", str(text))


def style_font(style, size, bold=False, italic=False, color=RGBColor(0, 0, 0)):
    f = style.font
    f.name, f.size, f.bold, f.italic, f.color.rgb = FONT, Pt(size), bold, italic, color
    rpr = style.element.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.append(fonts)
    for a in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        fonts.set(qn(a), FONT)
    for a in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        if fonts.get(qn(a)) is not None:
            del fonts.attrib[qn(a)]


def para(doc, text="", bold=False, italic=False, size=None, color=None, indent=0, after=6, align=None, style=None):
    p = doc.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(after)
    if indent:
        p.paragraph_format.left_indent = Mm(indent)
    if align is not None:
        p.alignment = align
    if text:
        r = p.add_run(text)
        r.bold, r.italic = bold, italic
        if size:
            r.font.size = Pt(size)
        if color is not None:
            r.font.color.rgb = color
    return p


def shade(cell, fill):
    tcpr = cell._tc.get_or_add_tcPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:color"), "auto")
    sh.set(qn("w:fill"), fill)
    tcpr.append(sh)


def add_field(run, code):
    for kind, text in (("begin", None), (None, code), ("end", None)):
        if kind:
            el = OxmlElement("w:fldChar")
            el.set(qn("w:fldCharType"), kind)
        else:
            el = OxmlElement("w:instrText")
            el.set(qn("xml:space"), "preserve")
            el.text = text
        run._r.append(el)


def lines(text):
    return [l for l in str(text).split("\n") if l.strip()]


def put_text(doc, text):
    for line in lines(show(text)):
        m = re.match(r"^(\(\w\)|\d+\.\d+)\s+(.*)$", line)
        if m:
            p = para(doc, after=4, indent=10)
            p.paragraph_format.first_line_indent = Mm(-10)
            p.add_run(m.group(1) + "\t" + m.group(2))
            p.paragraph_format.tab_stops.add_tab_stop(Mm(10))
        else:
            para(doc, line, after=5)


def variant_label(key, t, multi):
    if not multi:
        return "Wording"
    return {"a": "Favours the " + t["side_a"], "b": "Favours the " + t["side_b"]}.get(key, "Balanced (default)")


def build():
    types = {}
    for f in glob.glob("contract_types/*.json"):
        d = json.load(open(f, encoding="utf-8"))
        types[d["id"]] = d
    if not types:
        raise SystemExit("No contract files found. Run this from the ClientClause folder.")
    ordered = [types[i] for i in ORDER if i in types] + [t for k, t in types.items() if k not in ORDER]

    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Mm(210), Mm(297)
    sec.left_margin = sec.right_margin = Mm(22)
    sec.top_margin, sec.bottom_margin = Mm(22), Mm(20)
    style_font(doc.styles["Normal"], 11)
    style_font(doc.styles["Heading 1"], 16, bold=True)
    style_font(doc.styles["Heading 2"], 12, bold=True)
    style_font(doc.styles["Heading 3"], 11, bold=True, italic=True)
    for name, sp in (("Heading 1", (0, 8)), ("Heading 2", (12, 3)), ("Heading 3", (6, 2))):
        pf = doc.styles[name].paragraph_format
        pf.space_before, pf.space_after, pf.keep_with_next = Pt(sp[0]), Pt(sp[1]), True
    style_font(doc.styles["List Bullet"], 11)

    fp = sec.footer.paragraphs[0]
    r = fp.add_run("ClientClause: draft clause library for legal review. Page ")
    r.font.size = Pt(8.5)
    r.font.color.rgb = GREY
    r2 = fp.add_run()
    r2.font.size = Pt(8.5)
    r2.font.color.rgb = GREY
    add_field(r2, "PAGE")

    total = sum(len(t["clauses"]) for t in ordered)
    para(doc, "CLIENTCLAUSE", bold=True, size=26, after=2)
    para(doc, "Clause library for legal review", size=16, after=14)
    para(doc, "%d agreement types, %d clauses. Generated %s." % (len(ordered), total, datetime.date.today().strftime("%d %B %Y")),
         color=GREY, after=16)
    para(doc, "Reviewer: ______________________________        Date: ________________", after=18)

    doc.add_heading("What this is", level=2)
    para(doc, "ClientClause drafts agreements for freelancers, tenants and small businesses in India. The software extracts facts "
              "from what the user says and fills them into the clauses below. It does not write the legal wording. The wording "
              "in this document is therefore the substance of the product, and it has not yet been reviewed by a practising lawyer.")
    doc.add_heading("How to review", level=2)
    for b in ("Please use Track Changes and Comments (Review tab) so that every edit and query is visible.",
              "Mark anything incorrect, unenforceable, missing, one-sided or poorly worded, and anything that should be removed.",
              "Tell me which agreement types should not be offered at all, and which clauses should never be left out.",
              "Most useful: your three most important changes per agreement."):
        para(doc, b, style="List Bullet", after=3)
    doc.add_heading("How to read it", level=2)
    for b in ("Square brackets such as [monthly rent] are filled in automatically from the user's details.",
              "Some clauses have three wordings. Balanced is the default. Users can switch to a wording that favours one side, "
              "and the tool then warns them that the clause is one-sided.",
              "Numbers shown here are the full list. Optional clauses are left out when they do not apply, and the tool "
              "renumbers automatically.",
              "Risk level is my own rating of how much a clause matters. Please correct it where I have misjudged.",
              "The tool also applies the automatic checks listed for each agreement, and fills standard defaults for details "
              "the user did not give, flagging that it has done so."):
        para(doc, b, style="List Bullet", after=3)

    for t in ordered:
        h = doc.add_heading(t["name"], level=1)
        h.paragraph_format.page_break_before = True
        para(doc, show(t.get("description", "")), italic=True, color=GREY, after=8)

        doc.add_heading("Details collected", level=2)
        tb = doc.add_table(rows=1, cols=4)
        tb.style = "Table Grid"
        tb.autofit = False
        widths = (Mm(68), Mm(22), Mm(20), Mm(56))
        for i, name in enumerate(("Detail", "Type", "Required", "Default")):
            c = tb.rows[0].cells[i]
            c.text = ""
            run = c.paragraphs[0].add_run(name)
            run.bold = True
            run.font.size = Pt(9.5)
            shade(c, "E8E8E8")
        for f in t["fields"]:
            row = tb.add_row().cells
            d = f.get("default")
            d = "today's date" if d == "@today" else ("same as " + f["default_from"].replace("_", " ") if f.get("default_from") else (d or ""))
            for i, v in enumerate((f["label"], f.get("type", "text"), "Yes" if f.get("required") else "", d)):
                row[i].text = ""
                run = row[i].paragraphs[0].add_run(str(v))
                run.font.size = Pt(9.5)
        for row in tb.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = w
        para(doc, "", after=4)

        doc.add_heading("Opening of the agreement", level=2)
        for p in t.get("preamble", []):
            para(doc, show(p), after=5)

        doc.add_heading("Clauses", level=2)
        for n, c in enumerate(t["clauses"], start=1):
            doc.add_heading("%d. %s" % (n, c["title"]), level=3)
            para(doc, "Risk level: " + str(c.get("risk", "low")).capitalize() +
                 ("  |  Optional (shown only when its detail is given)" if c.get("only_if") else ""),
                 italic=True, size=9.5, color=GREY, after=3)
            keys = [k for k in ("a", "balanced", "b") if k in c["variants"]] or list(c["variants"])
            multi = len(keys) > 1
            for k in keys:
                if multi:
                    para(doc, variant_label(k, t, True), bold=True, size=10.5, after=2)
                put_text(doc, c["variants"][k])
                if multi:
                    para(doc, "", after=2)

        if t.get("rules"):
            doc.add_heading("Automatic checks", level=2)
            for r_ in t["rules"]:
                para(doc, r_["message"], style="List Bullet", after=2)

    out = "ClientClause-Clause-Library.docx"
    doc.save(out)
    print("Created", out, "with", len(ordered), "agreement types and", total, "clauses")


if __name__ == "__main__":
    build()
