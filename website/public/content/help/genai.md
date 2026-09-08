# Generative AI

You can generate **entry titles** and **titles and captions** for figures, tables, code snippets, and equations. The notebook does not invent images; it only writes text from what you already put in the entry.

## Setup

1. Open **Settings** from the activity bar gear or the project menu (the notebook name in the top bar).
2. Under **Generative AI**, turn **Enable Gen AI** on. Provider and API key fields stay hidden until then.
3. Pick a provider: **Google**, **OpenAI**, or **Anthropic**.
4. Paste an API key for that provider. Keys stay in **this browser only**. They are not saved in the notebook or in Git.
5. Optionally type a **model id**. Leave it blank to use the built-in default for that provider (currently `gemini-3.5-flash-lite` for Google).

Create a key from the provider’s site:

- [Google AI Studio](https://aistudio.google.com/apikey)
- [OpenAI platform](https://platform.openai.com/api-keys)
- [Anthropic console](https://console.anthropic.com/settings/keys)

Switching providers keeps each key and model id. You still need a valid key for whichever provider is selected.

## How generation works

Click the **sparkles** button next to a field:

- **Entry title** in the editor header (uses the entry body and metadata).
- **Title** and **caption** on a figure, table, code block, or equation.

Figures send the compressed image to the model. Other resources send their text (table contents, code, or LaTeX). You can generate again to replace the current text.

For figures, put a short title or caption first with anything the image cannot show: where it came from, what it is, or why it is in the notebook. Something as basic as `robot arm research from YouTube` is enough. The model uses that together with the picture, so generated titles and captions stay more accurate.

You still need a real title and caption before save; generation is a starting point for judges-ready wording, not a substitute for checking accuracy.

## Privacy and cost

The editor cannot call Google, OpenAI, or Anthropic directly from the browser. It posts to this site’s `/api/genai` route, which forwards the prompt (and image, if any) to the vendor you chose.

- **Vercel / this website** does not bill you for model tokens.
- **Your API key’s account** is billed by Google, OpenAI, or Anthropic.
- Do not put a shared team key in Settings on a public computer. Anyone with that browser profile can use it.

If generation fails, check the key, the model id (vendors rename models), and that the figure has finished loading.
