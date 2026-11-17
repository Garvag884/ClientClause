import json
import re
from datetime import date
from pathlib import Path

import os
import time
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from llm import ask_json

ROOT = Path(__file__).resolve().parent.parent
TYPES = {}
for f in (ROOT / "contract_types").glob("*.json"):
    t = json.loads(f.read_text(encoding="utf-8"))
    TYPES[t["id"]] = t

app = FastAPI()

ORIGINS = [o.strip() for o in os.getenv("FRONTEND_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS or ["*"],
                   allow_methods=["*"], allow_headers=["*"])

LIMIT = int(os.getenv("DRAFTS_PER_HOUR", "30"))
_hits = {}


def check_rate(request):
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    now = time.time()
    recent = [t for t in _hits.get(ip, []) if now - t < 3600]
    if len(recent) >= LIMIT:
        raise HTTPException(429, "Too many drafts from this connection. Please try again in a while.")
    recent.append(now)
    _hits[ip] = recent
BLANK = re.compile(r"\[[a-z0-9_ ]+\?\]")


class DraftIn(BaseModel):
    text: str


class BuildIn(BaseModel):
    type_id: str
    fields: dict = {}
    variants: dict = {}


# ---------- Indian number formatting ----------
ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen"]
TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _below_hundred(n):
    if n < 20:
        return ONES[n]
    return (TENS[n // 10] + (" " + ONES[n % 10] if n % 10 else "")).strip()


def _below_thousand(n):
    parts = []
    if n >= 100:
        parts.append(ONES[n // 100] + " Hundred")
        n %= 100
    if n:
        parts.append(_below_hundred(n))
    return " ".join(parts)


def inr_words(amount):
    amount = round(float(amount), 2)
    if amount >= 10 ** 10:
        return ""
    rupees = int(amount)
    paise = int(round((amount - rupees) * 100))
    if rupees == 0 and paise == 0:
        return "Zero"
    parts = []
    for size, name in ((10000000, "Crore"), (100000, "Lakh"), (1000, "Thousand")):
        q = rupees // size
        if q:
            parts.append(_below_thousand(q) + " " + name)
            rupees %= size
    if rupees:
        parts.append(_below_thousand(rupees))
    text = " ".join(parts)
    if paise:
        text += (" and " if text else "") + _below_hundred(paise) + " Paise"
    return text


def inr(amount):
    amount = round(float(amount), 2)
    whole = int(amount)
    s = str(whole)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups + [tail])
    paise = int(round((amount - whole) * 100))
    return s + ("." + str(paise).zfill(2) if paise else "/-")


def fmt_date(v):
    try:
        return date.fromisoformat(str(v)).strftime("%d %B %Y").lstrip("0")
    except ValueError:
        return str(v)


# ---------- Step 1: classify ----------
def classify(text):
    options = [{"id": t["id"], "name": t["name"], "description": t["description"]}
               for t in TYPES.values()]
    prompt = (
        "Pick which agreement type best matches the user's request.\n"
        "Types: " + json.dumps(options) + "\n"
        "User request: " + text + "\n"
        'Reply with JSON only, like {"type_id": "nda"}. '
        'Use {"type_id": null} if none match.'
    )
    return ask_json(prompt).get("type_id")


# ---------- Step 2: extract ----------
def extract(text, t):
    spec = []
    for f in t["fields"]:
        desc = f["label"]
        if f.get("type") == "date":
            desc += " (format YYYY-MM-DD)"
        if f.get("type") == "number":
            desc += " (digits only, no symbols)"
        spec.append({"key": f["key"], "description": desc})
    prompt = (
        "Extract details for a " + t["name"] + " from the user's text.\n"
        "Fields: " + json.dumps(spec) + "\n"
        "User text: " + text + "\n"
        "Reply with JSON only. Use each field key. If a detail is not stated, "
        "use null. Never invent details."
    )
    data = ask_json(prompt)
    out = {}
    for f in t["fields"]:
        v = data.get(f["key"])
        if v in (None, ""):
            continue
        if f.get("type") == "number":
            v = re.sub(r"[^\d.]", "", str(v))
            if v == "":
                continue
        out[f["key"]] = v
    return out


# ---------- Step 3: defaults, display values, assembly ----------
def apply_defaults(t, fields):
    fields = dict(fields)
    for f in t["fields"]:
        k = f["key"]
        if fields.get(k) not in (None, ""):
            continue
        d = f.get("default")
        if d == "@today":
            fields[k] = date.today().isoformat()
        elif "default_from" in f and fields.get(f["default_from"]) not in (None, ""):
            fields[k] = fields[f["default_from"]]
        elif d is not None:
            fields[k] = str(d)
    return fields


def defaulted_labels(t, fields):
    out = []
    for f in t["fields"]:
        d = f.get("default")
        if d is None or d == "@today":
            continue
        if str(fields.get(f["key"], "")) == str(d):
            out.append(f["label"])
    return out


def shown_values(t, fields):
    out = {}
    for f in t["fields"]:
        k = f["key"]
        v = fields.get(k)
        if v in (None, ""):
            continue
        kind = f.get("type")
        if kind == "date":
            out[k] = fmt_date(v)
        elif kind == "number":
            try:
                num = float(v)
            except ValueError:
                out[k] = str(v)
                continue
            if f.get("money"):
                out[k] = inr(num)
                words = inr_words(num)
                if words:
                    out[k + "_words"] = words + " only"
            else:
                out[k] = str(int(num)) if num == int(num) else str(num)
        else:
            out[k] = str(v)
    return out


def fill(text, shown):
    def rep(m):
        v = shown.get(m.group(1))
        if v in (None, ""):
            return "[" + m.group(1).replace("_", " ") + "?]"
        return str(v)
    return re.sub(r"\{\{(\w+)\}\}", rep, text)


def build(t, fields, shown, variants):
    clauses = []
    n = 0
    for c in t["clauses"]:
        if c.get("only_if") and fields.get(c["only_if"]) in (None, ""):
            continue
        n += 1
        v = variants.get(c["id"], "balanced")
        if v not in c["variants"]:
            v = "balanced"
        clauses.append({
            "id": c["id"], "number": n, "title": c["title"],
            "risk": c.get("risk", "low"),
            "variant": v, "options": list(c["variants"].keys()),
            "text": fill(c["variants"][v], shown),
        })
    return clauses


# ---------- Step 4: verify ----------
def verify(t, fields, clauses, preamble, defaulted):
    report = []
    for f in t["fields"]:
        if f.get("required") and fields.get(f["key"]) in (None, ""):
            report.append({"level": "error", "message": "Missing detail: " + f["label"]})
    if any(BLANK.search(p) for p in preamble):
        report.append({"level": "warn",
                       "message": "The opening section (parties and background) still has blanks to fill, such as addresses."})
    for c in clauses:
        if BLANK.search(c["text"]):
            report.append({"level": "warn",
                           "message": f"Clause {c['number']} ({c['title']}) still has blanks to fill."})
    for r in t.get("rules", []):
        if r["type"] == "date_order":
            a, b = fields.get(r["before"]), fields.get(r["after"])
            if a and b:
                try:
                    if date.fromisoformat(str(a)) >= date.fromisoformat(str(b)):
                        report.append({"level": "error", "message": r["message"]})
                except ValueError:
                    report.append({"level": "error", "message": "Dates must be in YYYY-MM-DD format."})
        if r["type"] == "positive_number":
            v = fields.get(r["field"])
            if v not in (None, ""):
                try:
                    if float(v) <= 0:
                        report.append({"level": "error", "message": r["message"]})
                except ValueError:
                    report.append({"level": "error", "message": r["message"]})
        if r["type"] == "range":
            v = fields.get(r["field"])
            if v not in (None, ""):
                try:
                    x = float(v)
                    if x < r["min"] or x > r["max"]:
                        report.append({"level": "error", "message": r["message"]})
                except ValueError:
                    report.append({"level": "error", "message": r["message"]})
    if defaulted:
        report.append({"level": "warn",
                       "message": "Standard defaults were filled in for: " + "; ".join(defaulted) +
                                  ". Review them and change anything that does not match your deal."})
    for c in clauses:
        if c["variant"] != "balanced" and c["risk"] in ("high", "medium"):
            side = t["side_a"] if c["variant"] == "a" else t["side_b"]
            report.append({"level": "warn",
                           "message": f"Clause {c['number']} ({c['title']}) currently favours the {side}. "
                                      "Check that the other party is likely to accept it."})
    if not any(r["level"] == "error" for r in report):
        report.insert(0, {"level": "ok", "message": "All required details are present and consistent."})
    return report


def package(t, fields, variants):
    fields = apply_defaults(t, fields)
    shown = shown_values(t, fields)
    preamble = [fill(p, shown) for p in t.get("preamble", [])]
    clauses = build(t, fields, shown, variants)
    signature = {
        "closing": t.get("closing", "IN WITNESS WHEREOF, the Parties have signed this Agreement on the date and at the place stated at its beginning."),
        "date": shown.get("agreement_date", ""),
        "place": shown.get("signing_place", ""),
        "parties": [{"role": s["role"], "name": shown.get(s["name_field"], "")}
                    for s in t.get("signatories", [])],
        "witnesses": t.get("witnesses", 2),
    }
    return {
        "type_id": t["id"], "type_name": t["name"],
        "side_a": t["side_a"], "side_b": t["side_b"],
        "field_defs": t["fields"], "fields": fields,
        "preamble": preamble, "clauses": clauses, "signature": signature,
        "report": verify(t, fields, clauses, preamble, defaulted_labels(t, fields)),
    }


# ---------- API ----------
@app.post("/api/draft")
def draft(body: DraftIn, request: Request):
    check_rate(request)
    if len(body.text) > 4000:
        raise HTTPException(400, "Please keep the description under 4000 characters.")
    if len(body.text.strip()) < 10:
        raise HTTPException(400, "Please describe the agreement in a sentence or two.")
    try:
        type_id = classify(body.text)
        if type_id not in TYPES:
            names = ", ".join(t["name"] for t in TYPES.values())
            raise HTTPException(400, "I couldn't match that to a supported agreement yet. Supported: " + names)
        t = TYPES[type_id]
        fields = extract(body.text, t)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, "AI error: " + str(e))
    return package(t, fields, {})


@app.post("/api/build")
def rebuild(body: BuildIn):
    t = TYPES.get(body.type_id)
    if not t:
        raise HTTPException(400, "Unknown contract type")
    return package(t, body.fields, body.variants)


@app.post("/api/transcribe")
async def transcribe(request: Request, audio: UploadFile = File(...), mode: str = Form("auto")):
    check_rate(request)
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise HTTPException(503, "Voice input is not set up on this server.")
    data = await audio.read()
    if len(data) < 1000:
        raise HTTPException(400, "That recording was too short. Please try again.")
    if len(data) > 8_000_000:
        raise HTTPException(400, "That recording is too long. Keep it under about two minutes.")
    ctype = (audio.content_type or "audio/webm").split(";")[0].lower()
    ext = "mp4" if "mp4" in ctype else "ogg" if "ogg" in ctype else "wav" if "wav" in ctype else "webm"
    try:
        from openai import OpenAI
        client = OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1", timeout=40)
        file = ("speech." + ext, data, ctype)
        if mode == "translate":
            r = client.audio.translations.create(model="whisper-large-v3", file=file)
        else:
            extra = {"language": mode} if mode in ("en", "hi") else {}
            r = client.audio.transcriptions.create(
                model=os.getenv("WHISPER_MODEL", "whisper-large-v3-turbo"), file=file, **extra)
        text = (r.text or "").strip()
    except Exception as e:
        raise HTTPException(502, "Voice transcription failed: " + str(e)[:150])
    if not text:
        raise HTTPException(400, "I couldn't hear any speech. Try again closer to the microphone.")
    return {"text": text}


class PdfIn(BaseModel):
    type_id: str
    fields: dict = {}
    variants: dict = {}


@app.post("/api/pdf")
def make_pdf(body: PdfIn, request: Request):
    check_rate(request)
    t = TYPES.get(body.type_id)
    if not t:
        raise HTTPException(400, "Unknown contract type")
    data = package(t, body.fields, body.variants)
    try:
        from pdfgen import build_pdf
        pdf = build_pdf(data, ROOT / "frontend" / "logo.png")
    except Exception as e:
        raise HTTPException(500, "Could not build the PDF: " + str(e)[:120])
    name = re.sub(r"[^a-z0-9]+", "-", t["name"].lower()).strip("-") + ".pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="' + name + '"'})


@app.get("/api/health")
def health():
    return {"ok": True}


app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend")
