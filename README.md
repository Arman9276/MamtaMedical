# Mamta Medical

A static website for **Mamta Medical Retail & General Store**, Khatlwada, Gujarat — a local
pharmacy and general store. Customers browse products, read details and reviews, chat with an
AI assistant, and enquire over WhatsApp. The owner manages everything (products, stock, hours,
announcements, reviews) through a private admin panel.

The site is intentionally **simple and free to run**: plain HTML/CSS/JS on the front end, with
Firebase, Cloudinary, and a Cloudflare Worker doing the heavy lifting — all on free tiers.

- **Live site:** https://arman9276.github.io/MamtaMedical/
- **Stack cost:** ₹0 (GitHub Pages + Firebase free tier + Cloudflare Workers free tier + Cloudinary free tier)

---

## Contents

- [Tech stack](#tech-stack)
- [How the pieces fit together](#how-the-pieces-fit-together)
- [Project structure](#project-structure)
- [Data model (Firestore)](#data-model-firestore)
- [Local development](#local-development)
- [Configuration](#configuration)
- [The AI proxy (Cloudflare Worker)](#the-ai-proxy-cloudflare-worker)
- [PWA (installable + offline)](#pwa-installable--offline)
- [Deployment & CI pipeline](#deployment--ci-pipeline)
- [Docker image](#docker-image)
- [Security model](#security-model)
- [Contributing](#contributing)
- [Versioning & releases](#versioning--releases)
- [Roadmap](#roadmap)

---

## Tech stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Front end | Vanilla HTML / CSS / JavaScript (ES modules) | No framework, no build step |
| Database | Firebase Firestore | Products, announcements, settings, reviews |
| Auth | Firebase Auth (Google sign-in) | Owner-only admin access |
| Images | Cloudinary | Product photo uploads & delivery |
| AI proxy | Cloudflare Worker | Keeps Groq/Gemini API keys off the browser |
| Hosting | GitHub Pages | Served at a project subpath (`/MamtaMedical/`) |
| CI/CD | GitHub Actions | Security-gated, manual deploy |

There is **no build step** and **no `node_modules`** for the website itself — what you see in the
repo is what ships (plus a generated `config.js`, see [Configuration](#configuration)).

---

## How the pieces fit together

```
                         ┌──────────────────────────┐
   Customer's browser ──▶│  GitHub Pages (static)   │   index / products / admin
                         └────────────┬─────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
   ┌─────────────┐            ┌────────────────┐          ┌────────────────┐
   │  Firestore  │            │   Cloudinary   │          │ Cloudflare     │
   │ (products,  │            │ (product       │          │ Worker         │
   │  reviews…)  │            │  photos)       │          │ (AI proxy)     │
   └─────────────┘            └────────────────┘          └───────┬────────┘
                                                                  ▼
                                                          Groq → Gemini
                                                          (keys stay server-side)
```

- The **website never holds any AI keys.** The chatbot POSTs messages to the Worker, which calls
  Groq first and falls back to Gemini, then returns `{ text, provider }`.
- The **Firebase API key is public by design** (it ships to every browser). Real protection comes
  from `firestore.rules` + Google Cloud key restrictions — not from hiding the key.

---

## Project structure

```
MamtaMedical/
├── index.html              Home page
├── products.html           Product catalogue (search, filter, detail modal, reviews)
├── admin.html              Owner-only admin panel
│
├── css/
│   ├── index.css
│   ├── products.css
│   └── admin.css
│
├── js/
│   ├── config.template.js  Committed template → builds config.js at deploy
│   ├── config.js           Generated, GITIGNORED (Firebase config + WhatsApp number)
│   ├── chatbot.js          The "Mamta" AI assistant (talks to the Worker)
│   ├── index.js            Home page logic
│   ├── products.js         Catalogue, detail modal, reviews
│   └── admin.js            Admin panel logic
│
├── manifest.json           PWA manifest (installable app)
├── sw.js                   Service worker (offline app shell + image cache)
├── favicon.ico / .svg      Site icons (.ico for max browser support)
├── favicon-32.png
├── icons/                  PWA icons (192, 512, maskable, apple-touch)
│
├── server/
│   ├── worker.js           Cloudflare Worker (holds Groq/Gemini keys as secrets)
│   └── wrangler.toml       Worker deploy config
│
├── docs/
│   ├── AI-PROXY-SETUP.md   How to deploy the AI proxy (free)
│   ├── SECURITY.md         Security overview + bot-protection setup
│   └── firebase-hosting-headers.example.json
│
├── dockerfile              Multi-stage build → unprivileged nginx serving the static site
├── docker-compose.yml      Run the published image locally (port 8080)
├── .dockerignore
├── nginx/
│   └── default.conf        nginx config for the container (listens on 8080)
│
├── firestore.rules         Database access rules (who can read/write)
├── _headers                Security headers (Netlify / Cloudflare Pages only — ignored by GH Pages)
└── .github/workflows/      CI: security-scan.yml (code + deploy), docker-pipeline.yml (image)
```

---

## Data model (Firestore)

Four collections. All are **public-read** except where noted; **only the verified owner can write**
(except `reviews`, which the public can create).

| Collection | Public can | Owner can | Key fields |
|------------|-----------|-----------|------------|
| `products` | read | read/write | `name`, `brand`, `cat`, `price`, `unit`, `inStock`, `photoUrl`, `emoji`, `desc`, `createdAt` |
| `announcements` | read | read/write | `title`, `body`, `type` (`info`/`warn`/`danger`), `createdAt` |
| `settings` | read | read/write | store hours / info (⚠️ world-readable — never store private data here) |
| `reviews` | **create** (validated) + read approved | read all, update, delete | `productId`, `name`, `rating` (1–5), `text`, `approved`, `createdAt` |

**Reviews are the only thing the public can write**, so the rules validate them tightly: exact field
set, the product must exist, name 2–40 chars, rating an int 1–5, text 3–600 chars, `approved` must be
`false` on create (customers can never self-publish), and `createdAt` must be the server timestamp.
Customers only ever *read* reviews where `approved == true`. The owner approves/deletes from the admin
**Reviews** tab.

The full rules live in `firestore.rules` — read them before touching anything data-related.

---

## Local development

The site uses ES modules and Firebase, so you **must** serve it over HTTP — opening the `.html`
files directly (`file://`) will not work.

```bash
# 1. Clone
git clone git@github.com:Arman9276/MamtaMedical.git
cd MamtaMedical

# 2. Create your local config (see Configuration below)
cp js/config.template.js js/config.js
#    then paste your real Firebase apiKey into js/config.js

# 3. Serve
python3 -m http.server 8000
#    → open http://localhost:8000
```

Notes for local work:
- **Admin login** needs the Google account whose email matches `firestore.rules` (`isOwner()`).
- **The chatbot** needs a deployed Worker URL in `js/chatbot.js` (`AI_PROXY_URL`). Without it, the rest
  of the site still works.
- **The service worker** caches aggressively. While developing, use a hard reload (Ctrl+Shift+R) or
  DevTools → Application → Service Workers → *Unregister*, or just work in an Incognito window.

---

## Configuration

`js/config.js` is the single source of shared values and is **gitignored** (kept out of the repo so
secret scanners stay quiet). It is produced two ways:

- **Locally:** `cp js/config.template.js js/config.js` and paste your Firebase `apiKey`.
- **In CI:** the deploy workflow generates it from `config.template.js`, substituting the
  `__FIREBASE_API_KEY__` placeholder with the repo secret `FIREBASE_API_KEY`.

So the **GitHub Actions secret `FIREBASE_API_KEY` must be set** (Settings → Secrets and variables →
Actions) or the deploy fails fast with a clear error.

Things to set before a fresh deploy:
- `js/chatbot.js` → `AI_PROXY_URL` (your deployed Worker URL)
- `index.html` / `products.html` → replace any `REPLACE_ME.example` with the real site URL + share image
- Firebase secret `FIREBASE_API_KEY` in GitHub Actions

---

## The AI proxy (Cloudflare Worker)

Lives in `server/`. The website never sees the AI keys — the Worker holds `GROQ_KEY` and `GEMINI_KEY`
as encrypted secrets, validates the request, tries Groq, falls back to Gemini, and returns the reply.

Deploy (free):

```bash
cd server
npx wrangler login
npx wrangler deploy
npx wrangler secret put GROQ_KEY
npx wrangler secret put GEMINI_KEY
```

Then copy the deployed `https://…workers.dev` URL into `js/chatbot.js` → `AI_PROXY_URL`. Optionally set
`ALLOWED_ORIGIN` in `wrangler.toml` to lock the proxy to your site. Full guide in
`docs/AI-PROXY-SETUP.md`.

---

## PWA (installable + offline)

The site is a Progressive Web App.

- `manifest.json` — app name, brand colours, icons, and a "Browse Products" shortcut. Paths are
  **relative** so it works on the GitHub Pages subpath.
- `sw.js` — the service worker. It pre-caches the static shell (HTML/CSS/JS/fonts/icons) and caches
  product photos, so the home and products pages load offline. **Firebase, Google sign-in, the AI
  proxy, and the map are never cached** — they always go to the network, so login and live data can't
  go stale.

> **When you change any front-end file, bump `SHELL_VERSION` in `sw.js`** (e.g. `v2` → `v3`). That
> wipes the old cache so visitors get the new files. On GitHub Pages the SW itself is cached ~10 min,
> so an update can take a few minutes to reach existing visitors.

---

## Deployment & CI pipeline

Hosting is **GitHub Pages**. Deployment is **not automatic on push** — it is a manual,
security-gated pipeline (Continuous Delivery with a manual trigger).

The orchestrator is `.github/workflows/security-scan.yml`, run from **Actions → "Security scan" →
Run workflow**. It runs scans in sequence and only deploys if they all pass:

```
Betterleaks (secret scan)
      ↓ needs
Semgrep (SAST, fails on findings)
      ↓ needs
CodeQL (JavaScript)
      ↓ needs
Deploy to GitHub Pages   ← page-deploy.yml, only runs if all scans pass
```

`page-deploy.yml` assembles a `_site/` folder with **only the live files**, generates `config.js` from
the template + secret, and publishes.

> ⚠️ **IMPORTANT — read before adding any new file.** The deploy step copies an explicit list of files
> into `_site/`. **If you add a new static asset (image, JS, JSON, icon, etc.) you MUST add it to the
> copy list in `.github/workflows/page-deploy.yml`, or it will 404 in production** even though it's in
> the repo. (This is exactly how the first PWA deploy shipped broken — the files were committed but
> never published.) After a deploy, check the build log's `Publishing:` list to confirm your file is
> there.

The Docker image has its **own** orchestrator, `docker-pipeline.yml` — see [Docker image](#docker-image)
below. The remaining workflows (`artifacts-demo`, `job`, the self-hosted runner test, `smart-pipeline`)
are **standalone learning workflows** and are not part of either pipeline.

---

## Docker image

The site is also published as a Docker image (`arman9276/mamta-medical`) — a static build served by an
**unprivileged nginx** on Alpine. GitHub Pages is production; the image is for self-hosting and local
parity. *(The Docker Hub repo is currently private — you need access to pull it.)*

**Run it locally**

```bash
docker compose up        # uses docker-compose.yml → http://localhost:8080
# or
docker run --rm -p 8080:8080 arman9276/mamta-medical:v1.4.2
```

nginx listens on **8080** inside the container and runs as the non-root `nginx` user.

**Build & publish pipeline** — `.github/workflows/docker-pipeline.yml`, run from **Actions → "Docker
pipeline" → Run workflow**, where you enter the version tag (e.g. `v1.4.2`):

```
docker-lint (hadolint)
      ↓ needs
Build & push to Docker Hub   ← single immutable version tag, no :latest
      ↓ needs
Trivy image scan             ← fails on fixable HIGH/CRITICAL CVEs
```

The version you enter is the single source of truth: it's used for both the pushed tag and the scan
target, so the two can't drift.

> ⚠️ **Adding a new static file?** As well as the `page-deploy.yml` copy list (above), the **`dockerfile`
> copies an explicit list of files** into the image. Add your new top-level asset to the `COPY` lines in
> `dockerfile` too, or it'll be missing from the container even though it's in the repo.

> **Config note:** `js/config.js` is injected at deploy and is **not** baked into the image. The static
> pages serve without it, but Firebase-backed features won't initialise when running the bare image.

---

## Security model

- **Owner-only writes.** `firestore.rules` defines `isOwner()` as a signed-in user with a *verified*
  email matching the owner's. Everything is locked down by default (`allow read, write: if false`).
- **Reviews** are the single public-writable collection, and are heavily validated + start unapproved.
- **No secrets in the repo.** Firebase `apiKey` is public-by-design; the AI keys live only in the
  Worker; `config.js` is gitignored and built at deploy time.
- **CI scanning gate.** Secrets scan + SAST + CodeQL must pass before anything deploys.
- **Headers.** `_headers` hardens responses on Netlify/Cloudflare Pages (note: GitHub Pages ignores
  this file). Admin is `noindex` and never framed.

See `docs/SECURITY.md` for details and the optional chatbot bot-protection (Cloudflare Turnstile).

---

## Contributing

This project follows a deliberate, **incremental** style: one feature at a time, with working code at
every step.

**Workflow**
1. `git pull` first — the CI/owner may have pushed (e.g. a generated file), and starting behind causes
   painful divergent-branch merges.
2. Work in small commits with clear messages (the repo uses a loose `type: summary` style, e.g.
   `feature: …`, `fix: …`).
3. Test locally over `http.server` before pushing.
4. Push to `main`, then deploy manually via the **Security scan** workflow (see above).

**Checklist when your change adds or touches files**
- [ ] New static file? → added it to the copy list in `page-deploy.yml`.
- [ ] New static file? → also added it to the `COPY` lines in `dockerfile` (same trap, container side).
- [ ] Changed HTML/CSS/JS? → bumped `SHELL_VERSION` in `sw.js`.
- [ ] Touched data access? → re-read and, if needed, updated `firestore.rules`.
- [ ] Any public input rendered with `innerHTML`? → escaped it (see the `esc()` helpers).
- [ ] Nothing fabricated — prices, claims, and content are real.

---

## Versioning & releases

Semantic versioning via git tags (`vMAJOR.MINOR.PATCH`).

- **MAJOR** — breaking change
- **MINOR** — new feature, backwards-compatible
- **PATCH** — fix

```bash
git tag v1.4.2
git push origin v1.4.2
```

Then draft the release on GitHub against that tag. Verify the change is actually live **before**
tagging a release. If the release ships a new container build, run the **Docker pipeline** with the
**same** `vX.Y.Z` so the image tag and the GitHub release agree.

---

## Roadmap

Planned, in order of value-for-effort (all free, no new infrastructure):

1. **Multi-item WhatsApp enquiry list** — collect several products into one WhatsApp message
   (front-end only, no backend).
2. **Gujarati / Hindi language toggle** — local-language accessibility.
3. **"Request restock"** on out-of-stock items — reuses the reviews security pattern; gives the owner
   real demand data.
4. **Live "Open now / Closed" badge** — computed from store hours.

---

*Maintained by [Arman Narsinh](https://github.com/Arman9276) · armannarsinh08@gmail.com*
