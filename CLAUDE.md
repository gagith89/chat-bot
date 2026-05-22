# CLAUDE.md — VoiceChat Project Guide

## What this project is

A Flask + Anthropic Claude web app for multilingual voice chat.
Users speak or type in English, Spanish, French, or Chinese; Claude replies in the same language (text + TTS). Non-English messages and replies show an English translation below each chat bubble.

---

## How to run

```bash
# Windows (installs deps + starts server)
start.bat

# Mac / Linux
pip install -r requirements.txt && python app.py
```

Server runs at **http://localhost:5000**. Requires Chrome or Edge for voice input.

Set `ANTHROPIC_API_KEY` in `.env` before starting.

---

## Project layout

```
app.py          Flask server — routes, Claude API calls, translation logic
prompts.py      SYSTEM_PROMPT, MODEL, MAX_TOKENS, LANGUAGES, detect_language()
templates/
  index.html    Single-page chat UI (rendered by Flask)
static/
  css/style.css All styles including .translation bubble styling
  js/app.js     Main controller: history, fetch /chat, wires UI + Speech
  js/speech.js  Web Speech API — STT (mic) and TTS (voice output)
  js/ui.js      Pure DOM layer: addBubble(), addTranslation(), status bar
.env            ANTHROPIC_API_KEY (never committed)
.env.example    Template for .env
requirements.txt
start.bat       Windows one-command launcher
```

---

## Key architecture decisions

- **API key never reaches the browser.** All Claude calls happen in `app.py`.
- **Language config is defined once** in `prompts.py → LANGUAGES` and served to the frontend via `GET /languages`. Do not duplicate language data in JS.
- **Language detection runs server-side** in `detect_language()`. The client-side `guessLangInfoFromText()` in `app.js` is only used to show the user bubble immediately (before the server responds) and mirrors the same logic.
- **Translation is a second Claude call** inside `_translate_to_english()` in `app.py`. It only fires when the detected language is not English.
- **User bubble is shown immediately**, then updated with `userTranslation` after the server responds via `UI.addTranslation()`.

---

## API endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Serves the chat page |
| GET | `/languages` | Returns `LANGUAGES` dict as JSON |
| POST | `/chat` | Accepts `{ messages }`, returns reply + translations |

### POST /chat response shape

```json
{
  "reply":           "Bonjour! Comment puis-je vous aider?",
  "lang":            "fr",
  "langInfo":        { "label": "FR", "flag": "🇫🇷", "name": "Français", "bcp47": "fr-FR", "voicePrefix": "fr" },
  "translation":     "Hello! How can I help you?",
  "userTranslation": "Hello, how are you today?"
}
```

`translation` and `userTranslation` are `null` when the detected language is English.

---

## Language detection

Defined in `prompts.py → DETECTION_RULES`. Rules are checked in order; first match wins. Falls back to `"en"`.

Each rule has:
- `char_pattern` — Unicode character range regex (primary signal)
- `word_pattern` — common-word regex (secondary signal, only applied when non-empty)

The `detect_language()` function checks `char_pattern` first, then only checks `word_pattern` if `rule["word_pattern"].pattern` is non-empty. This avoids the Chinese rule's empty `word_pattern` matching every string.

The client-side `guessLangInfoFromText()` in `app.js` mirrors the same two-step logic (char check → word check).

---

## How to add a new language

1. **`prompts.py → LANGUAGES`** — add an entry with `label`, `flag`, `name`, `bcp47`, `voicePrefix`.
2. **`prompts.py → DETECTION_RULES`** — add a rule with `lang`, `char_pattern`, `word_pattern`. Insert it before the most general rules.
3. **`prompts.py → SYSTEM_PROMPT`** — mention the new language in rule 1 so Claude knows to detect and reply in it.
4. **`app.js → guessLangInfoFromText()`** — add a matching client-side pattern so the user bubble flag shows immediately.

No frontend changes needed for the badge list or language config — those are loaded dynamically from `/languages`.

---

## Common commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run dev server (debug mode on by default)
python app.py

# Check server is up
curl http://localhost:5000/languages

# Change port or disable debug
FLASK_PORT=8080 FLASK_DEBUG=false python app.py
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | required | Your Anthropic key |
| `FLASK_PORT` | `5000` | Port the server listens on |
| `FLASK_DEBUG` | `true` | Flask debug/reload mode |

---

## Model settings (`prompts.py`)

| Variable | Current value | Notes |
|----------|--------------|-------|
| `MODEL` | `claude-haiku-4-5-20251001` | Fast and cheap; swap to `claude-sonnet-4-6` for higher quality |
| `MAX_TOKENS` | `512` | Max tokens for chat replies |

Translation calls use the same `MODEL` with `max_tokens=256`.
