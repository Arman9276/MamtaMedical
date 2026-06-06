# Security overview

This project has several layers of protection. Here's what each one does and
how to turn on the optional ones.

## What's already protecting you

1. **Firestore rules** (`firestore.rules`) — the real lock. Anyone can *read*
   products/announcements, but only the owner's signed-in account can *write*.
   This is enforced on Google's servers, so it can't be bypassed from the browser.

2. **Admin login** — Google Sign-In, limited to the owner email. Bots can't log in.

3. **API keys are off the website** — Groq and Gemini keys live in the Cloudflare
   Worker (`server/worker.js`), never in the browser. See `docs/AI-PROXY-SETUP.md`.

4. **The Worker limits abuse** — it only accepts POST, caps message count and size,
   and can be locked to your domain (`ALLOWED_ORIGIN` in `wrangler.toml`).

5. **Output escaping** — text saved in the admin panel is escaped before being shown,
   so it can't inject code into the page.

6. **Security headers** — `_headers` (Netlify / Cloudflare Pages) or
   `docs/firebase-hosting-headers.example.json` (Firebase Hosting) add protections
   like clickjacking defense and keeping the admin page out of search engines.

## Optional: human check on the chatbot (Cloudflare Turnstile)

This stops bots from spamming your chatbot and burning your free AI quota. It's a
privacy-friendly check that's usually invisible to real visitors. **Free.**
It's **off by default** and the chatbot works fine without it.

### Why only the chatbot, not the whole site?

You *want* bots like Google to visit your site — that's how customers find you in
search (we added SEO tags for exactly that). Blocking all bots would also block
Google and hide your shop. So instead we verify a human only at the one place
where bots cost you money: the AI chatbot.

### How to turn it on

1. In the Cloudflare dashboard, go to **Turnstile** and add a widget for your
   site's domain. You'll get two keys: a **Site key** (public) and a
   **Secret key** (private).

2. Put the **Site key** in `js/chatbot.js`:
   ```js
   const TURNSTILE_SITEKEY = 'your-site-key-here';
   ```

3. Give the **Secret key** to the Worker (it stays server-side):
   ```bash
   cd server
   npx wrangler secret put TURNSTILE_SECRET
   ```

4. Re-deploy the Worker (`npx wrangler deploy`) and re-upload `js/chatbot.js`.

That's it. Now the Worker rejects any chatbot request that doesn't pass the human
check. If the check ever fails or is unavailable, the chatbot quietly falls back
to its built-in offline answers — it won't break for real visitors.
