import json
import os
import re
import time
from dotenv import load_dotenv

load_dotenv()

TIMEOUT = float(os.getenv("LLM_TIMEOUT", "25"))      # seconds per request
DEADLINE = float(os.getenv("LLM_DEADLINE", "50"))    # seconds in total, across providers
RETRIES = 2
COOLDOWN_TEMPORARY = 60
COOLDOWN_PERMANENT = 600

_cooldown = {}
last_provider = None

GEMINI_MODELS = []
for _m in [os.getenv("LLM_MODEL", "gemini-3.5-flash-lite"),
           "gemini-3.1-flash-lite", "gemini-3.5-flash"]:
    if _m not in GEMINI_MODELS:
        GEMINI_MODELS.append(_m)

MESSAGES = {
    "not_configured": "The AI service is not set up on this server. Please try again later.",
    "timeout": "The AI took too long to answer. Your text is saved, so please try again in a moment.",
    "busy": "The AI services are busy right now. Your text is saved, so please try again in a minute.",
    "bad_output": "The AI sent back an answer that could not be used. Your text is saved, so please try again.",
    "failed": "The AI request failed. Your text is saved, so please try again.",
}


class AIError(Exception):
    def __init__(self, kind, detail=""):
        super().__init__(detail or kind)
        self.kind = kind
        self.user_message = MESSAGES[kind]


def _kind(e):
    t = (type(e).__name__ + " " + str(e)).lower()
    if any(m in t for m in ("timeout", "timed out", "deadline")):
        return "timeout"
    if any(m in t for m in ("429", "503", "overload", "rate limit", "unavailable", "high demand", "quota")):
        return "busy"
    if any(m in t for m in ("empty answer", "no json", "incomplete json", "json")):
        return "bad_output"
    return "failed"


def friendly(e):
    """A safe, plain message for the user. Raw provider text is never shown."""
    if isinstance(e, AIError):
        return e.user_message
    return MESSAGES[_kind(e)]


def _openai_style(base_url, key, model, prompt, system):
    from openai import OpenAI
    client = OpenAI(api_key=key, base_url=base_url, timeout=TIMEOUT)
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    resp = client.chat.completions.create(model=model, messages=messages)
    text = resp.choices[0].message.content
    if not text or not text.strip():
        raise ValueError("empty answer")
    return text


def _call_groq(prompt, system):
    return _openai_style("https://api.groq.com/openai/v1", os.getenv("GROQ_API_KEY"),
                         os.getenv("GROQ_MODEL"), prompt, system)


def _call_openrouter(prompt, system):
    return _openai_style("https://openrouter.ai/api/v1", os.getenv("OPENROUTER_API_KEY"),
                         os.getenv("OPENROUTER_MODEL"), prompt, system)


def _call_nvidia(prompt, system):
    return _openai_style("https://integrate.api.nvidia.com/v1", os.getenv("NVIDIA_API_KEY"),
                         os.getenv("NVIDIA_MODEL"), prompt, system)


def _call_gemini(prompt, system):
    from google import genai
    from google.genai import types
    client = genai.Client(http_options=types.HttpOptions(timeout=int(TIMEOUT * 1000)))
    config = types.GenerateContentConfig(system_instruction=system) if system else None
    last = None
    for model in GEMINI_MODELS:
        try:
            return client.models.generate_content(model=model, contents=prompt, config=config).text
        except Exception as e:
            last = e
    raise last


PROVIDERS = {
    "groq":       {"call": _call_groq,       "needs": ["GROQ_API_KEY", "GROQ_MODEL"]},
    "openrouter": {"call": _call_openrouter, "needs": ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"]},
    "nvidia":     {"call": _call_nvidia,     "needs": ["NVIDIA_API_KEY", "NVIDIA_MODEL"]},
    "gemini":     {"call": _call_gemini,     "needs": ["GEMINI_API_KEY"]},
}


def _priority_order():
    wanted = os.getenv("LLM_PRIORITY", "groq,nvidia,gemini").split(",")
    names = [n.strip().lower() for n in wanted if n.strip()]
    return [n for n in names if n in PROVIDERS and all(os.getenv(k) for k in PROVIDERS[n]["needs"])]


def _is_permanent(error):
    text = str(error).lower()
    return any(m in text for m in ["401", "403", "404", "invalid api key", "api key not valid",
                                   "permission", "not found", "unauthorized", "no endpoints"])


def ask_llm(prompt, system="", validate=None):
    global last_provider
    order = _priority_order()
    if not order:
        raise AIError("not_configured")
    started = time.time()
    ready = [n for n in order if _cooldown.get(n, 0) <= started]
    resting = [n for n in order if n not in ready]
    kinds = []

    def expired():
        return time.time() - started > DEADLINE

    for name in ready + resting:
        if expired():
            kinds.append("timeout")
            break
        for attempt in range(RETRIES):
            if expired():
                kinds.append("timeout")
                break
            t0 = time.time()
            try:
                text = PROVIDERS[name]["call"](prompt, system)
            except Exception as e:
                k = _kind(e)
                kinds.append(k)
                print("[AI]", name, "failed (" + k + "):", str(e)[:120])
                if _is_permanent(e):
                    _cooldown[name] = time.time() + COOLDOWN_PERMANENT
                    break
                if attempt == RETRIES - 1:
                    _cooldown[name] = time.time() + COOLDOWN_TEMPORARY
                else:
                    time.sleep(1.5)
                continue
            if validate:
                try:
                    validate(text)
                except Exception as e:
                    kinds.append("bad_output")
                    print("[AI]", name, "gave an unusable answer (" + str(e)[:60] + "), trying next provider")
                    break
            _cooldown.pop(name, None)
            last_provider = name
            print("[AI]", name, "answered in", round(time.time() - t0, 1), "s")
            return text

    for k in ("timeout", "busy", "bad_output", "failed"):
        if k in kinds:
            raise AIError(k)
    raise AIError("failed")


def _parse_json(text):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"```(?:json)?", "", text)
    start = text.find("{")
    if start == -1:
        raise ValueError("no JSON found")
    depth, in_str, esc, end = 0, False, False, -1
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end == -1:
        raise ValueError("incomplete JSON")
    chunk = text[start:end + 1]
    try:
        return json.loads(chunk)
    except ValueError:
        return json.loads(re.sub(r",\s*([}\]])", r"\1", chunk))


def ask_json(prompt, system=""):
    holder = {}

    def check(text):
        holder["data"] = _parse_json(text)

    ask_llm(prompt, system, validate=check)
    return holder["data"]
