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

## The Firebase web API key (why GitHub flags it — and what actually matters)

GitHub's secret scanner flags the Firebase `apiKey` in `js/config.js` as a
"leaked secret." For a Firebase **web** app this is a false alarm in the usual
sense: the web API key is a *public client identifier*, not a credential. It is
shipped to every visitor's browser by design and grants no access on its own —
Google documents this explicitly. What protects your data is `firestore.rules`,
Firebase Auth, and (optionally) App Check, **not** the secrecy of this string.

### What actually protects you — restrict the key
Do this in Google Cloud Console → APIs & Services → Credentials → your Browser key:

1. **Application restrictions → HTTP referrers**: allow only your own origins
   (your GitHub Pages / custom domain, plus `http://localhost:*` for testing).
   The key then only works from your site.
2. **API restrictions**: limit it to the Firebase APIs you actually use, so it
   can't be spent against other billable Google APIs.
3. **(Recommended) Rotate**: create a new restricted browser key, update the
   `FIREBASE_API_KEY` secret (below), deploy, then delete the old key. This also
   kills the value that was already exposed in Git history.

> ⚠️ Do **not** blindly follow GitHub's "revoke through Google" step — deleting
> the key without a replacement will break the live site. Restrict/rotate instead.

### Keeping the key out of the source (what silences the scanner)
The real key no longer lives in the repo. Instead:

- `js/config.template.js` is committed with a placeholder `__FIREBASE_API_KEY__`.
- The real `js/config.js` is **git-ignored** and never committed.
- On deploy, `page-deploy.yml` generates `js/config.js` from the template,
  substituting the repo secret `FIREBASE_API_KEY`.

This removes the key from source and future history (so scanners stay quiet),
but note it does **not** hide the key from users — the deployed static site still
contains it. That's expected and fine; see the restriction steps above.

**One-time setup**
1. GitHub repo → Settings → Secrets and variables → Actions → New repository
   secret → name `FIREBASE_API_KEY`, value = your (rotated) browser key.
2. Stop tracking the old file: `git rm --cached js/config.js` then commit. The
   placeholder template stays tracked; the real config.js is now ignored.

**Local development**
```
cp js/config.template.js js/config.js     # one time
# then replace __FIREBASE_API_KEY__ in js/config.js with your real key
```
`js/config.js` is git-ignored, so your local key never gets committed.

## Customer reviews — the one place the public can write

Reviews (`reviews` collection) are different from everything else: any visitor can
submit one without logging in. That makes the Firestore rules the only thing
standing between you and spam/abuse, so the `create` rule validates every field:

- the exact set of fields must be present (nothing extra can be smuggled in);
- the product being reviewed must actually exist;
- `name` is 2–40 characters, `text` is 3–600 characters, `rating` is a whole
  number 1–5;
- `createdAt` must equal the server's time — a client can't backdate a review;
- `approved` must be `false` — **a customer can never publish their own review.**

Reviews stay hidden until you approve them:

- the public can only *read* reviews where `approved == true`;
- only the owner can flip `approved` to `true` (approve) or delete a review.

Review names and text are **untrusted public input**, so they are HTML-escaped
before display (unlike the product description, which only you can write and is
therefore treated as trusted rich text).

### Optional hardening
Validation can't stop a determined bot from submitting *many* valid-looking
reviews. If that ever becomes a problem, the same Cloudflare Turnstile check used
for the chatbot (above) can be required before a review is accepted, or Firebase
App Check can be enabled to allow writes only from your real site.

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
