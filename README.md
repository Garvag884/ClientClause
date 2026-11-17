# ClientClause: AI contract copilot for Indian freelancers
# ClientClause

**An AI contract drafting assistant for freelancers, employees and small businesses in India.**

Describe an agreement in plain language and ClientClause drafts it, checks that nothing is missing, and lets you adjust the wording of each clause before you print or save it as a PDF.

Built for the HackIndia **AI for Lawyers Hackathon** (Problem Statement 3: Smart Contract Creation, tracks: AI Contract Drafting and Access to Justice).

> Live demo: _add the public Koyeb link after deployment_

## The problem

Freelancers, new employees and small startups often work with no written contract, or sign one supplied by the other side. Hiring a lawyer for a Rs. 50,000 project isn't practical. General AI chatbots can write contract-sounding text, but they can leave out key clauses, contradict themselves, and sound confident about things they haven't checked.

## What ClientClause does

1. **Understands the request.** The AI identifies which agreement you need and pulls out names, amounts, dates and terms from your description.
2. **Drafts from a vetted clause library.** The AI never writes the legal wording. Every clause comes from a library of clauses written for this project, with the details filled in.
3. **Verifies the draft.** A rule-based checker flags missing details, impossible dates, out-of-range numbers, blanks still left in the text, and any default value that was assumed for you.
4. **Lets you adjust the balance.** Risky clauses have alternative wordings (for example "Favours Freelancer", "Balanced", "Favours Client"), and the checker warns when you pick a one-sided option.
5. **Produces a document you can use.** Indian-style amounts in figures and words (`Rs. 1,20,000/-` and "One Lakh Twenty Thousand only"), a preamble with parties and addresses, lettered sub-clauses, a signature block with witnesses, and a clean print or PDF layout with a watermark.

Missing details are highlighted in the contract and in the checklist, and clicking one jumps to the form field that fixes it.

## Supported agreements

| Agreement | Highlights |
|---|---|
| Freelance services | Scope, payment terms, GST and TDS, revisions, IP ownership, termination |
| Non-disclosure (NDA) | Definition of confidential information, permitted disclosures, exclusions, duration, remedies |
| Employment | Probation, salary, working hours, leave, benefits, conduct, notice and final settlement |
| Rent agreement | Rent and yearly increase, security deposit, lock-in and notice, repairs, handover, stamp duty and registration |

## How accuracy is protected

- **The AI does not write legal text.** It classifies the request and extracts facts. All wording comes from the clause library.
- **Nothing is invented.** Details the user didn't state are left blank and flagged, or filled with a clearly labelled standard default.
- **Deterministic checks.** The verifier is plain Python rules, not another AI guess, so the same input always gives the same report.
- **Always flagged for review.** The app states that it is a drafting aid and recommends review by a lawyer before signing.

## AI provider fallback

Free AI tiers are often overloaded, so the app tries providers in a priority order and moves on when one fails:

- Retries temporary errors (busy, rate limited), then switches to the next provider
- Skips providers with bad keys or retired models for a while
- Treats empty or non-JSON answers as failures
- Supports Groq, Gemini, NVIDIA (Nemotron) and OpenRouter, in any order, through one environment variable

## Tech stack

- **Backend:** Python, FastAPI
- **Frontend:** plain HTML, CSS and JavaScript (no build step)
- **AI:** Groq, Google Gemini, NVIDIA NIM, OpenRouter (any one is enough)
- **Contract content:** JSON files, one per agreement type

## Project structure

```
ClientClause/
  backend/
    main.py            API, classification, extraction, assembly, verifier
    llm.py             AI providers and the fallback loop
    requirements.txt
  contract_types/      one JSON file per agreement (fields, rules, clauses)
    freelance.json
    nda.json
    employment.json
  frontend/
    index.html         the whole web app
    logo.png           logo and print watermark
```

## Run it locally

You need Python 3.10 or newer and at least one free API key (for example from Groq or Google AI Studio).

```bash
git clone https://github.com/Garvag884/ClientClause.git
cd ClientClause
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Create `backend/.env` (this file is git-ignored, and keys must never be committed):

```
LLM_PRIORITY=groq,nvidia,gemini
GROQ_API_KEY=your_key
GROQ_MODEL=a_chat_model_id_from_the_groq_console
GEMINI_API_KEY=your_key
NVIDIA_API_KEY=your_key
NVIDIA_MODEL=a_chat_model_id_from_build.nvidia.com
```

Only the providers you list in `LLM_PRIORITY` and have keys for are used. Model names change often, so copy current ids from each provider's console.

API request bodies are capped at 13 MB by default (`MAX_API_BODY_BYTES`). The rate limiter uses the direct connection address and ignores `X-Forwarded-For` unless the request comes from a trusted proxy. If the app runs behind a reverse proxy, set `TRUSTED_PROXY_CIDRS` to the proxy's exact IP addresses or CIDR ranges, separated by commas. Do not use a range that includes untrusted clients. Without this setting, clients routed through the same proxy may share one rate-limit bucket.

```bash
cd backend
uvicorn main:app --reload
```

Open http://127.0.0.1:8000 and try this (made-up details):

> I'm Riya Sharma, a freelance web developer. I'm building an e-commerce website for Acme Traders for 50,000 rupees. Work starts 1 December 2026 and is due 31 January 2027. Courts in Bengaluru.

## Deploy a public demo on Koyeb

The root `Dockerfile` runs the frontend and FastAPI backend together, so both use the same public URL. To deploy:

1. Create a Koyeb Web Service from the GitHub repository's `main` branch, using the root `Dockerfile`.
2. Select the Free instance and a supported free region (Frankfurt or Washington, D.C.). Expose port `8000` over HTTP.
3. Add the AI provider environment variables in the Koyeb service settings. Keep API keys in Koyeb Secrets; never commit them to the repository. At least one configured provider and matching model is required. The app supports Groq (`GROQ_API_KEY`, `GROQ_MODEL`), NVIDIA (`NVIDIA_API_KEY`, `NVIDIA_MODEL`), Gemini (`GEMINI_API_KEY`), and OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`). Set `LLM_PRIORITY` to the provider order you want to use.
4. After deployment succeeds, copy the generated public HTTPS URL into the Live demo line above.

The free Koyeb instance is intended for previews and hobby projects. It has limited CPU and memory, and scales to zero after an hour without traffic, so the first request after idle may take longer.

## Add a new agreement type

Each agreement is a data file, so adding one needs no new code. Create `contract_types/your_type.json` with:

- `id`, `name`, `description` and the two sides (`side_a`, `side_b`)
- `fields`: what to collect (type, whether it is required, optional defaults)
- `rules`: checks such as `date_order`, `positive_number` and `range`
- `preamble`: the opening lines, with `{{field}}` placeholders
- `clauses`: each with a title and one to three variants (`a`, `balanced`, `b`)
- `signatories` for the signature block

Restart the server and it is picked up automatically.

## Roadmap

- Plain-English explanation of each clause
- Review mode: paste an existing contract and get risks flagged
- More agreement types (rental, vendor, loan, partnership)
- State-wise stamp duty guidance and regional language output
- A test set with measured accuracy

## Limitations

- This is a drafting aid, **not legal advice**. Stamp duty, registration and employment rules vary by state, so have a lawyer review any contract before signing.
- Clause wording is a general starting point and has not been reviewed by a practising lawyer.
- Free AI tiers can be slow or rate limited, and free-tier requests may be used by the provider to improve its products. Use made-up details when testing.

## Author

Garv Agarwala
