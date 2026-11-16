import json
import os
import re
import time
from dotenv import load_dotenv

load_dotenv()

TIMEOUT = 25                 # seconds per request
RETRIES = 2                  # tries per provider for temporary errors
COOLDOWN_TEMPORARY = 60      # skip a busy provider for this long (seconds)
COOLDOWN_PERMANENT = 600     # skip a provider with a bad key/model for this long

_cooldown = {}               # provider name -> time until which it is skipped
last_provider = None         # which provider answered most recently

GEMINI_MODELS = []
for _m in [os.getenv("LLM_MODEL", "gemini-3.5-flash-lite"),
           "gemini-3.1-flash-lite", "gemini-3.5-flash"]:
    if _m not in GEMINI_MODELS:
        GEMINI_MODELS.append(_m)


# ---------- providers ----------
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
        raise ValueError('empty answer')
    return text


def _call_groq(prompt, system):
    return _openai_style("https://api.groq.com/openai/v1",
                         os.getenv("GROQ_API_KEY"), os.getenv("GROQ_MODEL"),
                         prompt, system)


def _call_openrouter(prompt, system):
    return _openai_style("https://openrouter.ai/api/v1",
                         os.getenv("OPENROUTER_API_KEY"), os.getenv("OPENROUTER_MODEL"),
                         prompt, system)


def _call_nvidia(prompt, system):
    return _openai_style("https://integrate.api.nvidia.com/v1",
                         os.getenv("NVIDIA_API_KEY"), os.getenv("NVIDIA_MODEL"),
                         prompt, system)


def _call_gemini(prompt, system):
    from google import genai
    from google.genai import types
    client = genai.Client(http_options=types.HttpOptions(timeout=TIMEOUT * 1000))
    config = types.GenerateContentConfig(system_instruction=system) if system else None
    last = None
    for model in GEMINI_MODELS:
        try:
            return client.models.generate_content(
                model=model, contents=prompt, config=config).text
        except Exception as e:
            last = e
    raise last


PROVIDERS = {
    "groq":       {"call": _call_groq,       "needs": ["GROQ_API_KEY", "GROQ_MODEL"]},
    "openrouter": {"call": _call_openrouter, "needs": ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"]},
    "nvidia":     {"call": _call_nvidia,     "needs": ["NVIDIA_API_KEY", "NVIDIA_MODEL"]},
    "gemini":     {"call": _call_gemini,     "needs": ["GEMINI_API_KEY"]},
}


# ---------- the fallback loop ----------
def _priority_order():
    wanted = os.getenv("LLM_PRIORITY", "groq,nvidia,gemini").split(",")
    names = [n.strip().lower() for n in wanted if n.strip()]
    return [n for n in names
            if n in PROVIDERS and all(os.getenv(k) for k in PROVIDERS[n]["needs"])]


def _is_permanent(error):
    text = str(error).lower()
    markers = ["401", "403", "404", "invalid api key", "api key not valid",
               "permission", "not found", "unauthorized", "no endpoints"]
    return any(m in text for m in markers)


def ask_llm(prompt, system="", validate=None):
    """Try providers in priority order until one gives a usable answer.
    `validate` is an optional function that raises if an answer is unusable."""
    global last_provider
    order = _priority_order()
    if not order:
        raise RuntimeError("No usable API key found in backend/.env")

    now = time.time()
    ready = [n for n in order if _cooldown.get(n, 0) <= now]
    resting = [n for n in order if n not in ready]
    problems = []

    for name in ready + resting:          # resting ones are a last resort
        for attempt in range(RETRIES):
            started = time.time()
            try:
                text = PROVIDERS[name]["call"](prompt, system)
            except Exception as e:
                problems.append(name + ": " + str(e)[:120])
                print("[AI]", name, "failed:", str(e)[:120])
                if _is_permanent(e):
                    _cooldown[name] = time.time() + COOLDOWN_PERMANENT
                    break                 # no point retrying, next provider
                if attempt == RETRIES - 1:
                    _cooldown[name] = time.time() + COOLDOWN_TEMPORARY
                else:
                    time.sleep(1.5)
                continue

            if validate:
                try:
                    validate(text)
                except Exception as e:
                    problems.append(name + ": unusable answer (" + str(e)[:60] + ")")
                    print("[AI]", name, "gave an unusable answer, trying next provider")
                    break                 # bad answer: next provider, no cooldown

            _cooldown.pop(name, None)
            last_provider = name
            print("[AI]", name, "answered in", round(time.time() - started, 1), "s")
            return text

    raise RuntimeError("All AI providers failed. " + " | ".join(problems[-4:]))


# ---------- JSON helper ----------
def _parse_json(text):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON found")
    return json.loads(text[start:end + 1])


def ask_json(prompt, system=""):
    holder = {}

    def check(text):
        holder["data"] = _parse_json(text)

    ask_llm(prompt, system, validate=check)
    return holder["data"]
