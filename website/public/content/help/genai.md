# Generative AI

> **Disclaimer — read this before you turn Gen AI on.**
>
> **Do not use generative AI if your competition (or school) rules disallow it.** Enabling this feature does not make AI-assisted writing legal or acceptable for your event. Check the current rules yourself.
>
> **Even when AI assistance is allowed, every listed author is responsible for the notebook.** Review all generated titles, captions, and other text. Verify accuracy, that it reflects work the team actually did, and that it meets originality and citation requirements. Generated wording is a draft, not a substitute for engineering judgment.

You can generate **entry titles** and **titles/captions** for figures, tables, code, and equations. The product does not invent images.

## Setup

1. Open **Account → Preferences** (or notebook-related GenAI settings where shown).
2. Enable Gen AI and pick a provider: **Google**, **OpenAI**, **Anthropic**, or **Custom AI**.
3. For cloud providers, paste an API key. For **Custom AI**, set an OpenAI-compatible base URL (for example `http://127.0.0.1:1234/v1`) and a key only if required.
4. Keys stay in **this browser** (`localStorage`). They are not stored in notebook JSON or server prefs.

Create keys from the provider:

- [Google AI Studio](https://aistudio.google.com/apikey)
- [OpenAI platform](https://platform.openai.com/api-keys)
- [Anthropic console](https://console.anthropic.com/settings/keys)

**Custom AI** talks to any OpenAI-compatible `/v1` server from this browser (LM Studio, llama.cpp, Ollama, etc.). Enable CORS on that server.

## Using generation

Click the **sparkles** control next to a field. For figures, a short human hint in the caption area improves accuracy. Always review output before treating it as final.

See also [Judge](/help/judge) for rubric-based notebook scoring (separate from caption GenAI).
