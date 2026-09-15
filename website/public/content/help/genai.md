# Generative AI

> **Disclaimer — read this before you turn Gen AI on.**
>
> **Do not use generative AI if your competition (or school) rules disallow it.** Enabling this feature does not make AI-assisted writing legal or acceptable for your event. Check the current rules yourself.
>
> **Even when AI assistance is allowed, every listed author is responsible for the notebook.** Review all generated titles, captions, and other text. Verify accuracy, that it reflects work the team actually did, and that it meets originality and citation requirements. Generated wording is a draft, not a substitute for engineering judgment.

You can generate **entry titles** and **titles and captions** for figures, tables, code snippets, and equations. The notebook does not invent images; it only writes text from what you already put in the entry.

## Setup

1. Open **Settings** from the activity bar gear or the project menu (the notebook name in the top bar).
2. Under **Generative AI**, turn **Enable Gen AI** on. Provider and API key fields stay hidden until then.
3. Pick a provider from the dropdown: **Google**, **OpenAI**, **Anthropic**, or **Local**.
4. For Google, OpenAI, or Anthropic, paste an API key. For **Local**, paste the OpenAI-compatible base URL (for example `http://127.0.0.1:1234/v1`) and an API key only if the server requires one. Values stay in **this browser only**. They are not saved in the notebook or in Git.
5. Type a **model id**, or use the search icon to pick from the list. Cloud lists are filtered to models that can take **text and images** (needed for figure captions). Generation warns if no model is set.

Create a key from the provider’s site:

- [Google AI Studio](https://aistudio.google.com/apikey)
- [OpenAI platform](https://platform.openai.com/api-keys)
- [Anthropic console](https://console.anthropic.com/settings/keys)

**Local** talks to any OpenAI-compatible `/v1` server from this browser, including loopback addresses such as `http://127.0.0.1:1234/v1` (LM Studio, llama.cpp, Ollama). Enable CORS on that server so this site can reach it.

Switching providers keeps each key, URL, and model id. Cloud providers still need a valid key; Local needs a reachable URL.

## How generation works

Click the **sparkles** button next to a field:

- **Entry title** in the editor header (uses the entry body and metadata).
- **Title** and **caption** on a figure, table, code block, or equation.

Figures send the compressed image to the model. Other resources send their text (table contents, code, or LaTeX). You can generate again to replace the current text.

For figures, put a short title or caption first with anything the image cannot show: where it came from, what it is, or why it is in the notebook. Something as basic as `robot arm research from YouTube` is enough. The model uses that together with the picture, so generated titles and captions stay more accurate.

You still need a real title and caption before save; generation is a starting point for judges-ready wording, not a substitute for checking accuracy.

## Privacy and cost

The editor cannot call Google, OpenAI, or Anthropic directly from the browser. It posts to this site’s `/api/genai` route, which forwards the prompt (and image, if any) to the vendor you chose. **Local** is the exception: the browser calls your URL directly so `127.0.0.1` is your machine, not the website host.

- **Vercel / this website** does not bill you for model tokens.
- **Your API key’s account** is billed by Google, OpenAI, or Anthropic. A local server uses whatever machine is running it.
- Do not put a shared team key in Settings on a public computer. Anyone with that browser profile can use it.

If generation fails, check the key or local URL, the model id (vendors rename models), CORS on a local server, and that the figure has finished loading.
