# AI Proxy Setup (Cloudflare Workers — free)

This moves the Groq and Gemini API keys **off the website** and onto a small
server (a Cloudflare Worker) so visitors can never read them. The Cloudflare
free plan covers this completely — **100,000 requests/day, no credit card.**

Files involved: `worker.js`, `wrangler.toml`, and `chatbot.js` (already updated).

---

## ⚠️ Step 0 — Rotate the old keys first (important)

The previous Groq and Gemini keys were visible in the website's code, so treat
them as compromised. Generate **new** ones and disable the old ones:

- **Groq:** https://console.groq.com/keys — create a new key, delete the old.
- **Gemini:** https://aistudio.google.com/apikey — create a new key, delete the old.

You'll paste the new keys in Step 4 (they go to the server, never the browser).

---

## Step 1 — Create a free Cloudflare account

Sign up at https://dash.cloudflare.com/sign-up (free, no card needed).

## Step 2 — Get the tools

Install Node.js (https://nodejs.org) if you don't have it. Then, in a terminal,
go to the folder that contains `worker.js` and `wrangler.toml`.

## Step 3 — Log in and deploy

```bash
npx wrangler login      # opens a browser to authorise
npx wrangler deploy
```

After deploy, Wrangler prints a URL like:

```
https://mamta-ai.<your-subdomain>.workers.dev
```

Copy that URL.

## Step 4 — Add the keys as secrets

```bash
npx wrangler secret put GROQ_KEY      # paste the NEW Groq key, press Enter
npx wrangler secret put GEMINI_KEY    # paste the NEW Gemini key, press Enter
```

These are encrypted on Cloudflare's side and are never in your code or the browser.

## Step 5 — Point the website at the proxy

Open `chatbot.js` and set the URL from Step 3:

```js
const AI_PROXY_URL = 'https://mamta-ai.<your-subdomain>.workers.dev/';
```

(keep the trailing slash). Re-upload `chatbot.js` to your site.

## Step 6 (recommended) — Lock it to your site

In `wrangler.toml`, uncomment and set your real site URL:

```toml
[vars]
ALLOWED_ORIGIN = "https://your-site-url.example"
```

Then run `npx wrangler deploy` again. Now only your site can use the proxy.

---

## How to test

Open the website, open the chatbot, and ask "price of Dolo 650?". You should
get an AI reply. If the proxy is unreachable, the chatbot automatically falls
back to its built-in offline answers — it won't break.

To check the proxy directly:

```bash
curl -X POST https://mamta-ai.<your-subdomain>.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

You should get back `{"text":"...","provider":"Groq · Llama 4"}`.

---

## What changed in the code

- `chatbot.js` no longer contains any API keys. It calls `AI_PROXY_URL` via a
  single `callProxy()` function; the offline `localAI()` fallback is unchanged.
- `worker.js` holds the keys (as secrets), calls **Groq first then Gemini**,
  and — unlike the old client code — passes your store's system prompt to
  Gemini too, so Gemini answers also know your hours, address, and catalogue.
