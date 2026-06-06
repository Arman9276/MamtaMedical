# Mamta Medical — project structure

A static website (HTML/CSS/JS) backed by Firebase, with an AI chatbot and an
owner admin panel. Everything is now split into clear folders so it's easy to
find and change things.

```
MamtaMedical/
├── index.html              Home page
├── products.html           Product catalogue
├── admin.html              Owner-only admin panel
│
├── css/                    All styles (one file per page)
│   ├── index.css
│   ├── products.css
│   └── admin.css
│
├── js/                     All scripts
│   ├── config.js           Shared Firebase config (edit in ONE place)
│   ├── chatbot.js          The "Mamta" AI assistant
│   ├── index.js            Home page logic
│   ├── products.js         Product catalogue logic
│   └── admin.js            Admin panel logic
│
├── server/                 The AI proxy (keeps API keys off the website)
│   ├── worker.js           Cloudflare Worker (holds Groq/Gemini keys)
│   └── wrangler.toml       Worker deploy config
│
├── docs/                   Guides
│   ├── AI-PROXY-SETUP.md    How to deploy the AI proxy (free)
│   ├── SECURITY.md          Security overview + bot-protection setup
│   └── firebase-hosting-headers.example.json
│
├── firestore.rules         Database access rules (who can read/write)
├── _headers                Security headers (Netlify / Cloudflare Pages)
└── .github/workflows/      CI files (Docker/scan workflows)
```

## Where to change common things

- **Phone number / Firebase project** → `js/config.js`
- **A page's look** → that page's file in `css/`
- **Chatbot behaviour** → `js/chatbot.js`
- **Who can edit data** → `firestore.rules`
- **Turn on the chatbot human-check** → see `docs/SECURITY.md`

## Before going live (placeholders to fill)

- `js/chatbot.js` → `AI_PROXY_URL` (your deployed Worker URL)
- `index.html` / `products.html` → replace `REPLACE_ME.example` with your real URL + share image
- Rotate the old Groq & Gemini keys (they were exposed earlier) — see `docs/AI-PROXY-SETUP.md`

## How to run locally

Because the site uses ES modules and Firebase, open it through a local server
(not by double-clicking the file). For example, from this folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000
