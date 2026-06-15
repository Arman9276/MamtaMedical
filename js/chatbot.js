/* ═══════════════════════════════════════════════════════════
   MAMTA MEDICAL — AI CHATBOT v3
   Cloud:    Cloudflare Worker proxy → Groq (Llama 4) then Gemini 2.0
             (API keys are held server-side, never in this file)
   Fallback: Local AI             — instant, offline
   WhatsApp: LAST RESORT ONLY
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── AI PROXY ──
     The Groq & Gemini API keys now live server-side in a Cloudflare
     Worker (see worker.js). Nothing secret is shipped to the browser.
     After deploying the Worker, paste its URL below. */
  const AI_PROXY_URL = 'https://mamta-ai.bloodbank7171.workers.dev/';

  /* ── BOT PROTECTION (optional) ──
     Paste your Cloudflare Turnstile SITE key here to require a human check
     before the chatbot calls the AI. Leave empty to keep it off.
     The matching SECRET key is verified inside the Worker (see worker.js). */
  const TURNSTILE_SITEKEY = '';
  const WA_NUM = '919426894254';
  const WA_PHONE = '+91 94268 94254';

  /* ── HTML ESCAPE (prevents stored/LLM content from injecting markup) ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ── CLOUDINARY: serve compressed, right-sized images (cuts image bandwidth ~80%) ── */
  function cldImg(url, width) {
    if (!url || url.indexOf('/upload/') === -1) return url;
    if (/\/upload\/[^/]*(f_auto|q_auto|w_\d)/.test(url)) return url;
    return url.replace('/upload/', '/upload/f_auto,q_auto,w_' + width + '/');
  }

  /* ── CATEGORY LABELS (kept in sync with products.html) ── */
  function mmCatLabel(c) {
    const m = { 'fever-pain': 'Fever & Pain', 'vitamins': 'Vitamins', 'skin': 'Skin Care', 'diabetes': 'Diabetes', 'baby': 'Baby Care', 'first-aid': 'First Aid', 'general': 'General Store' };
    return m[c] || c || '—';
  }

  /* ── LIVE PRODUCT DATA ──
     Source of truth is Firestore (edited via the admin panel). We read it
     without re-initialising Firebase here by reusing what products.html
     already loaded: first the in-memory list (products page), then the
     localStorage cache it writes (available on every page, incl. home),
     and only if neither exists do we fall back to the static list below.
     This keeps the chatbot's prices and stock status accurate. */
  function mmGetLiveProducts() {
    if (Array.isArray(window.__mmProducts) && window.__mmProducts.length) return window.__mmProducts;
    try {
      const raw = localStorage.getItem('mm-products-cache');
      if (raw) {
        const c = JSON.parse(raw);
        if (c && Array.isArray(c.data) && c.data.length && (!c.expiry || Date.now() < c.expiry)) return c.data;
      }
    } catch (e) { }
    return null;
  }

  /* Static fallback — used only when no live data is available yet. */
  const FALLBACK_CATALOGUE = `Crocin 500mg | GSK | Fever & Pain | ₹28 | 10 tabs | In Stock
Dolo 650mg | Micro Labs | Fever & Pain | ₹32 | 15 tabs | In Stock
Combiflam Tablet | Sanofi | Fever & Pain | ₹45 | 20 tabs | In Stock
Disprin 350mg | Reckitt | Fever & Pain | ₹18 | 10 tabs | In Stock
Vicks VapoRub | P&G | Fever & Pain | ₹95 | 25g | In Stock
Saridon Tablet | Bayer | Fever & Pain | ₹22 | 10 tabs | Out of Stock
Limcee Vitamin C | Abbott | Vitamins | ₹55 | 15 tabs | In Stock
Revital H Men | Sun Pharma | Vitamins | ₹199 | 30 caps | In Stock
Supradyn Daily | Bayer | Vitamins | ₹165 | 30 tabs | In Stock
Zincovit Tablet | Apex | Vitamins | ₹135 | 15 tabs | In Stock
Neurobion Forte | Procter | Vitamins | ₹48 | 30 tabs | In Stock
Calcimax Forte | Meyer | Vitamins | ₹180 | 30 tabs | Out of Stock
Himalaya Face Wash | Himalaya | Skin Care | ₹110 | 100ml | In Stock
Nivea Body Lotion | Nivea | Skin Care | ₹185 | 200ml | In Stock
Cetaphil Moisturizer | Galderma | Skin Care | ₹399 | 250ml | In Stock
Boroline Cream | GD Pharma | Skin Care | ₹65 | 40g | In Stock
Lacto Calamine | Piramal | Skin Care | ₹130 | 120ml | In Stock
Glucon-D Orange | HUL | Diabetes | ₹75 | 200g | In Stock
Accu-Chek Strips | Roche | Diabetes | ₹550 | 25 strips | In Stock
Sugar Free Natura | Zydus | Diabetes | ₹120 | 500 tabs | In Stock
Diabetone Capsule | Hamdard | Diabetes | ₹210 | 60 caps | Out of Stock
Johnson's Baby Powder | Johnson's | Baby Care | ₹155 | 200g | In Stock
Wipro Baby Oil | Wipro | Baby Care | ₹110 | 100ml | In Stock
Pampers Newborn | P&G | Baby Care | ₹349 | 22 pcs | In Stock
Cerelac Stage 1 | Nestlé | Baby Care | ₹210 | 300g | In Stock
Savlon Antiseptic | ICI | First Aid | ₹68 | 100ml | In Stock
Dettol Liquid | Reckitt | First Aid | ₹95 | 250ml | In Stock
Band-Aid Strips | J&J | First Aid | ₹55 | 20 pcs | In Stock
Burnol Cream | Boots | First Aid | ₹42 | 20g | In Stock
ORS Electral | Franco-Indian | First Aid | ₹15 | 1 sachet | In Stock
Crepe Bandage 4" | Generic | First Aid | ₹38 | 1 roll | In Stock
Colgate Total | Colgate | General Store | ₹99 | 150g | In Stock
Dettol Soap | Reckitt | General Store | ₹48 | 75g | In Stock
Lifebuoy Handwash | HUL | General Store | ₹89 | 215ml | In Stock
Scotch Brite Scrub | 3M | General Store | ₹35 | 1 pc | In Stock
Lizol Floor Cleaner | Reckitt | General Store | ₹175 | 500ml | In Stock
Tata Salt | Tata | General Store | ₹28 | 1 kg | In Stock
Surf Excel Easy Wash | HUL | General Store | ₹85 | 500g | In Stock
Good Knight Patch | Godrej | General Store | ₹75 | 12 patches | In Stock`;

  function mmBuildCatalogue() {
    const live = mmGetLiveProducts();
    if (!live) return FALLBACK_CATALOGUE;
    return live.map(p =>
      `${p.name} | ${p.brand || '—'} | ${mmCatLabel(p.cat)} | ₹${p.price} | ${p.unit || '—'} | ${p.inStock ? 'In Stock' : 'Out of Stock'}`
    ).join('\n');
  }

  /* ── SYSTEM PROMPT (built fresh on each request so it reflects live data) ── */
  function buildSystemPrompt() {
    return `You are Mamta, a friendly and knowledgeable AI assistant for "Mamta Medical Retail & General Store" in Khatlwada, Gujarat, India.

STORE INFO:
- Address: Main Bazar Road, Khatlwada – 396120, Gujarat
- Phone: ${WA_PHONE}
- Hours: Monday–Sunday, 8:30 AM – 8:30 PM
- Last day of every month: closes at 2:00 PM
- No home delivery currently
- Owner name: Not disclosed

PRODUCT CATALOGUE (Name | Brand | Category | Price | Pack | Stock):
${mmBuildCatalogue()}

YOUR CORE RULES — FOLLOW STRICTLY:
1. ALWAYS try to answer the question yourself first. Never give up easily.
2. Answer in the same language the customer uses — Hindi, Gujarati, or English.
3. For product questions: give price, stock status, brand, and pack size clearly.
4. For "medicine for X" questions: suggest 2-3 relevant products from catalogue with prices.
5. For dosage/usage questions: give general public knowledge (not medical advice).
6. Keep replies short — 2 to 5 lines maximum. No long paragraphs.
7. Be warm and helpful like a knowledgeable store assistant, not a robot.
8. Format prices with ₹ symbol always.
9. If a product is out of stock: say so clearly and suggest the closest alternative.
10. CRITICAL — WhatsApp/phone number rules:
    - NEVER show the WhatsApp number or phone proactively.
    - NEVER suggest "contact us on WhatsApp" unless the customer explicitly asks.
    - The store owner is busy — protect his time.
    - Only reveal contact info if customer directly asks "how to contact", "phone number", "whatsapp number", "speak to someone".
    - Even then, give the phone number as text only — do NOT offer to open WhatsApp.
11. If asked something completely outside your knowledge (rare medical condition, prescription advice): say you cannot advise on that and suggest visiting a doctor — do NOT redirect to WhatsApp.
12. Handle greetings warmly and ask how you can help.
13. You can answer general health questions using public knowledge.`;
  }

  /* ── CONVERSATION HISTORY ── */
  let history = [];
  let failCount = 0;
  let waShown = false;

  /* ─────────────────────────────────
     STYLES
  ───────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
.mm-overlay{
  position:fixed;inset:0;z-index:9000;
  background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  display:flex;align-items:flex-end;justify-content:center;
  padding:0;opacity:0;transition:opacity .3s;pointer-events:none;
}
.mm-overlay.open{opacity:1;pointer-events:all}
@media(min-width:560px){.mm-overlay{align-items:center;padding:20px}}

.mm-chat{
  width:100%;max-width:460px;height:92svh;max-height:700px;
  background:var(--bg,#060f1e);
  border:1px solid var(--border,rgba(255,255,255,.08));
  border-radius:20px 20px 0 0;
  display:flex;flex-direction:column;overflow:hidden;
  transform:translateY(40px);
  transition:transform .35s cubic-bezier(.34,1.56,.64,1);
  box-shadow:0 -8px 60px rgba(0,0,0,.5);
}
@media(min-width:560px){
  .mm-chat{border-radius:20px;transform:scale(.92);box-shadow:0 24px 80px rgba(0,0,0,.5)}
}
.mm-overlay.open .mm-chat{transform:none}

/* header */
.mm-head{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:12px 16px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));
  background:var(--bg2,#0c1a2e);flex-shrink:0;
}
.mm-head-left{display:flex;align-items:center;gap:10px}
.mm-avatar{
  width:38px;height:38px;background:var(--g,#00e571);
  border-radius:50%;display:grid;place-items:center;
  font-size:1.2rem;flex-shrink:0;position:relative;
}
.mm-avatar::after{
  content:'';position:absolute;bottom:1px;right:1px;
  width:9px;height:9px;background:#25d366;
  border-radius:50%;border:2px solid var(--bg2,#0c1a2e);
  animation:mmPulse 2s infinite;
}
@keyframes mmPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
.mm-head-info h4{
  font-family:'Syne',sans-serif;font-size:.88rem;font-weight:800;
  color:var(--text,#e8f0e8);
}
.mm-head-info p{font-size:.7rem;color:var(--g,#00e571);margin-top:1px}
.mm-head-btns{display:flex;gap:6px;align-items:center}
.mm-icon-btn{
  width:30px;height:30px;border-radius:50%;
  background:var(--bg3,#112240);border:1px solid var(--border,rgba(255,255,255,.08));
  display:grid;place-items:center;cursor:pointer;
  font-size:.8rem;color:var(--muted,#7a8f9e);
  transition:background .2s,color .2s;touch-action:manipulation;
}
.mm-icon-btn:hover{background:var(--gd,rgba(0,229,113,.1));color:var(--g,#00e571)}

/* messages */
.mm-messages{
  flex:1;overflow-y:auto;padding:14px 14px 8px;
  display:flex;flex-direction:column;gap:10px;
  scroll-behavior:smooth;
}
.mm-messages::-webkit-scrollbar{width:3px}
.mm-messages::-webkit-scrollbar-thumb{background:var(--border,rgba(255,255,255,.1));border-radius:3px}

/* bubbles */
.mm-bubble{display:flex;flex-direction:column;max-width:88%;animation:mmIn .25s ease both}
@keyframes mmIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.mm-bubble.bot{align-self:flex-start}
.mm-bubble.user{align-self:flex-end}
.mm-btext{
  padding:10px 13px;border-radius:14px;
  font-size:clamp(.8rem,2.3vw,.88rem);line-height:1.58;
}
.mm-bubble.bot .mm-btext{
  background:var(--bg2,#0c1a2e);color:var(--text,#e8f0e8);
  border-bottom-left-radius:4px;
  border:1px solid var(--border,rgba(255,255,255,.08));
}
.mm-bubble.user .mm-btext{
  background:var(--g,#00e571);color:#030d0a;
  border-bottom-right-radius:4px;font-weight:500;
}
.mm-btime{font-size:.6rem;color:var(--muted,#7a8f9e);margin-top:3px;padding:0 4px}
.mm-bubble.user .mm-btime{text-align:right}

/* product card */
.mm-pcard{
  background:var(--bg2,#0c1a2e);
  border:1px solid var(--border,rgba(255,255,255,.08));
  border-radius:12px;padding:12px 14px;
  max-width:88%;align-self:flex-start;
  animation:mmIn .3s ease both;
}
.mm-pcard-top{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.mm-pcard-emoji{font-size:1.5rem;flex-shrink:0}
.mm-pcard-photo{
  width:48px;height:48px;border-radius:8px;
  object-fit:cover;border:1px solid var(--border,rgba(255,255,255,.08));flex-shrink:0;
}
.mm-pcard-info h5{
  font-family:'Syne',sans-serif;font-size:.84rem;font-weight:800;
  color:var(--text,#e8f0e8);line-height:1.2;
}
.mm-pcard-info p{font-size:.7rem;color:var(--muted,#7a8f9e);margin-top:2px}
.mm-pcard-footer{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding-top:8px;border-top:1px solid var(--border,rgba(255,255,255,.08));
}
.mm-price{
  font-family:'Syne',sans-serif;font-size:.9rem;font-weight:800;
  color:var(--g,#00e571);
}
.mm-price small{font-family:'DM Sans',sans-serif;font-size:.64rem;color:var(--muted,#7a8f9e);font-weight:300}
.mm-stock{
  font-size:.62rem;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;padding:3px 8px;border-radius:20px;
}
.mm-stock.in{background:rgba(0,229,113,.1);color:var(--g,#00e571);border:1px solid rgba(0,229,113,.2)}
.mm-stock.out{background:rgba(255,80,80,.1);color:#ff6060;border:1px solid rgba(255,80,80,.2)}

/* visit store button — shown instead of WhatsApp */
.mm-visit-btn{
  display:flex;align-items:center;gap:8px;justify-content:center;
  background:var(--g,#00e571);color:#030d0a;
  padding:10px 16px;border-radius:10px;
  font-family:'Syne',sans-serif;font-size:.75rem;font-weight:700;
  letter-spacing:.04em;text-transform:uppercase;
  border:none;width:100%;margin-top:6px;
  transition:background .2s;touch-action:manipulation;min-height:42px;cursor:pointer;
}
.mm-visit-btn:hover{background:#00ff7f}

/* WhatsApp button — hidden, only shown when explicitly needed */
.mm-wa-btn{
  display:flex;align-items:center;gap:8px;justify-content:center;
  background:#25d366;color:#fff;
  padding:10px 16px;border-radius:10px;
  font-family:'Syne',sans-serif;font-size:.75rem;font-weight:700;
  letter-spacing:.04em;text-transform:uppercase;cursor:pointer;
  border:none;width:100%;margin-top:6px;
  transition:background .2s;touch-action:manipulation;min-height:42px;
}
.mm-wa-btn:hover{background:#1da851}

/* quick replies */
.mm-quick{display:flex;flex-wrap:wrap;gap:6px;padding:6px 14px 2px}
.mm-qbtn{
  padding:6px 13px;border-radius:20px;
  background:var(--bg2,#0c1a2e);
  border:1px solid var(--border,rgba(255,255,255,.1));
  color:var(--text,#e8f0e8);font-size:.75rem;font-weight:500;
  cursor:pointer;touch-action:manipulation;
  transition:background .15s,border-color .15s,color .15s;
  font-family:'DM Sans',sans-serif;
}
.mm-qbtn:hover,.mm-qbtn:active{
  background:var(--g,#00e571);border-color:var(--g,#00e571);color:#030d0a;
}

/* typing */
.mm-typing{
  display:flex;align-items:center;gap:5px;
  background:var(--bg2,#0c1a2e);border:1px solid var(--border,rgba(255,255,255,.08));
  padding:10px 14px;border-radius:14px;border-bottom-left-radius:4px;
  width:fit-content;align-self:flex-start;
}
.mm-typing span{
  width:6px;height:6px;background:var(--muted,#7a8f9e);
  border-radius:50%;animation:mmDot 1.2s infinite;
}
.mm-typing span:nth-child(2){animation-delay:.2s}
.mm-typing span:nth-child(3){animation-delay:.4s}
@keyframes mmDot{0%,80%,100%{transform:scale(1);opacity:.5}40%{transform:scale(1.3);opacity:1}}

/* provider badge */
.mm-provider{
  font-size:.6rem;color:var(--muted,#7a8f9e);
  padding:2px 7px;border-radius:10px;
  background:var(--bg3,#112240);
  border:1px solid var(--border,rgba(255,255,255,.06));
  display:inline-block;margin-top:3px;
}

/* input */
.mm-inputarea{
  padding:10px 12px;
  border-top:1px solid var(--border,rgba(255,255,255,.08));
  background:var(--bg2,#0c1a2e);flex-shrink:0;
  display:flex;gap:8px;align-items:flex-end;
}
.mm-input{
  flex:1;background:var(--bg,#060f1e);
  border:1px solid var(--border,rgba(255,255,255,.1));
  border-radius:10px;padding:10px 13px;
  font-family:'DM Sans',sans-serif;font-size:.88rem;
  color:var(--text,#e8f0e8);outline:none;resize:none;
  max-height:100px;line-height:1.5;
  transition:border-color .2s,box-shadow .2s;
}
.mm-input::placeholder{color:var(--muted,#7a8f9e)}
.mm-input:focus{border-color:var(--g,#00e571);box-shadow:0 0 0 3px rgba(0,229,113,.1)}
.mm-send{
  width:40px;height:40px;flex-shrink:0;
  background:var(--g,#00e571);border:none;border-radius:10px;
  display:grid;place-items:center;cursor:pointer;
  transition:background .2s,transform .15s;touch-action:manipulation;
}
.mm-send:hover{background:#00ff7f}
.mm-send:active{transform:scale(.9)}
.mm-send svg{color:#030d0a}
.mm-send.loading{background:var(--bg3,#112240);pointer-events:none}
.mm-send.loading svg{animation:mmSpin .7s linear infinite}
@keyframes mmSpin{to{transform:rotate(360deg)}}
`;
  document.head.appendChild(style);

  /* ── BUILD MODAL ── */
  const overlay = document.createElement('div');
  overlay.className = 'mm-overlay';
  overlay.id = 'mmOverlay';
  overlay.innerHTML = `
<div class="mm-chat" id="mmChat" role="dialog" aria-modal="true" aria-label="Mamta Medical Assistant">
  <div class="mm-head">
    <div class="mm-head-left">
      <div class="mm-avatar">🏥</div>
      <div class="mm-head-info">
        <h4>Mamta Medical Assistant</h4>
        <p id="mmStatus">● AI powered · Always here to help</p>
      </div>
    </div>
    <div class="mm-head-btns">
      <button class="mm-icon-btn" id="mmClear" title="Clear chat" aria-label="Clear chat">🗑</button>
      <button class="mm-icon-btn" id="mmClose" aria-label="Close chat">✕</button>
    </div>
  </div>
  <div class="mm-messages" id="mmMessages"></div>
  <div class="mm-quick" id="mmQuick"></div>
  <div class="mm-inputarea">
    <textarea class="mm-input" id="mmInput"
      placeholder="Ask about any product, price, medicine…"
      rows="1" aria-label="Type your message"></textarea>
    <button class="mm-send" id="mmSend" aria-label="Send message">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    </button>
  </div>
</div>`;
  document.body.appendChild(overlay);

  /* ─────────────────────────────────
     DOM HELPERS
  ───────────────────────────────── */
  const msgEl = () => document.getElementById('mmMessages');
  const quickEl = () => document.getElementById('mmQuick');

  function now() {
    const d = new Date();
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }
  function scrollBottom() {
    setTimeout(() => { const m = msgEl(); if (m) m.scrollTop = m.scrollHeight; }, 60);
  }
  function clearQuick() { const q = quickEl(); if (q) q.innerHTML = ''; }

  function addBubble(role, html, provider = '') {
    const wrap = document.createElement('div');
    wrap.className = 'mm-bubble ' + role;
    const providerBadge = (role === 'bot' && provider)
      ? `<span class="mm-provider">${provider}</span>` : '';
    wrap.innerHTML = `<div class="mm-btext">${html}</div>
    <div class="mm-btime">${now()} ${providerBadge}</div>`;
    msgEl().appendChild(wrap);
    scrollBottom();
  }

  function addProductCard(p) {
    const card = document.createElement('div');
    card.className = 'mm-pcard';
    card.innerHTML = `
    <div class="mm-pcard-top">
      ${p.photoUrl
        ? `<img class="mm-pcard-photo" src="${esc(cldImg(p.photoUrl, 400))}" alt="${esc(p.name)}" loading="lazy"/>`
        : `<span class="mm-pcard-emoji">${esc(p.emoji || '💊')}</span>`}
      <div class="mm-pcard-info">
        <h5>${esc(p.name)}</h5>
        <p>${esc(p.brand || '')} · ${esc(p.cat || '')}</p>
      </div>
    </div>
    <div class="mm-pcard-footer">
      <span class="mm-price">₹${esc(p.price)} <small>/ ${esc(p.unit || '')}</small></span>
      <span class="mm-stock ${p.inStock ? 'in' : 'out'}">${p.inStock ? '✓ In Stock' : '✗ Out of Stock'}</span>
    </div>
    <button class="mm-visit-btn">
      🏪 How to get this product?
    </button>`;
    // Bind via listener (not inline onclick) so the product name can't break out of a string.
    const vbtn = card.querySelector('.mm-visit-btn');
    if (vbtn) vbtn.addEventListener('click', () => {
      const inp = document.getElementById('mmInput');
      if (inp) { inp.value = `How do I get ${p.name}?`; inp.focus(); }
    });
    msgEl().appendChild(card);
    scrollBottom();
  }

  function setQuick(opts) {
    clearQuick();
    opts.forEach(opt => {
      const b = document.createElement('button');
      b.className = 'mm-qbtn';
      b.textContent = opt;
      b.addEventListener('click', () => handleInput(opt));
      quickEl().appendChild(b);
    });
  }

  function addTyping() {
    const t = document.createElement('div');
    t.className = 'mm-typing'; t.id = 'mmTyping';
    t.innerHTML = '<span></span><span></span><span></span>';
    msgEl().appendChild(t); scrollBottom();
  }
  function removeTyping() { const t = document.getElementById('mmTyping'); if (t) t.remove(); }

  /* show WhatsApp — ONLY when explicitly needed */
  function showWaOption(context = '') {
    if (waShown) return; // don't show twice
    waShown = true;
    const msg = context
      ? `Hi, I need help with: ${context}`
      : 'Hi Mamta Medical, I need help.';
    addBubble('bot',
      `Since you want to speak to someone directly, here is our store contact:<br/>
    <strong>📞 ${WA_PHONE}</strong><br/>
    <small style="color:var(--muted,#7a8f9e)">Call or WhatsApp during store hours · 8:30 AM – 8:30 PM</small>`
    );
    const btn = document.createElement('button');
    btn.className = 'mm-wa-btn';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a3.178 3.178 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.106.55 4.083 1.512 5.8L0 24l6.377-1.496A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.886 0-3.655-.518-5.171-1.418l-.371-.22-3.787.889.928-3.682-.241-.381A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
    Open WhatsApp Chat`;
    btn.addEventListener('click', () => {
      window.open(`https://wa.me/${WA_NUM}?text=${encodeURIComponent(msg)}`, '_blank');
    });
    msgEl().appendChild(btn);
    scrollBottom();
  }

  /* ─────────────────────────────────
     LOCAL AI FALLBACK
  ───────────────────────────────── */
  function localAI(q) {
    q = q.toLowerCase().trim();

    /* Source products from live data (admin/Firestore) when available,
       falling back to this static list only when fully offline. */
    const STATIC_PRODS = [
      { n: 'Crocin 500mg', b: 'GSK', p: 28, u: '10 tabs', s: true, e: '💊', c: 'Fever & Pain' },
      { n: 'Dolo 650mg', b: 'Micro Labs', p: 32, u: '15 tabs', s: true, e: '💊', c: 'Fever & Pain' },
      { n: 'Combiflam', b: 'Sanofi', p: 45, u: '20 tabs', s: true, e: '💊', c: 'Fever & Pain' },
      { n: 'Disprin', b: 'Reckitt', p: 18, u: '10 tabs', s: true, e: '💊', c: 'Fever & Pain' },
      { n: 'Vicks VapoRub', b: "P&G", p: 95, u: '25g', s: true, e: '🫙', c: 'Fever & Pain' },
      { n: 'Limcee Vitamin C', b: 'Abbott', p: 55, u: '15 tabs', s: true, e: '🍊', c: 'Vitamins' },
      { n: 'Revital H', b: 'Sun Pharma', p: 199, u: '30 caps', s: true, e: '🌿', c: 'Vitamins' },
      { n: 'Supradyn', b: 'Bayer', p: 165, u: '30 tabs', s: true, e: '🌿', c: 'Vitamins' },
      { n: 'Neurobion Forte', b: 'Procter', p: 48, u: '30 tabs', s: true, e: '💚', c: 'Vitamins' },
      { n: 'Himalaya Face Wash', b: 'Himalaya', p: 110, u: '100ml', s: true, e: '🧴', c: 'Skin Care' },
      { n: 'Cetaphil', b: 'Galderma', p: 399, u: '250ml', s: true, e: '🧴', c: 'Skin Care' },
      { n: 'Boroline Cream', b: 'GD Pharma', p: 65, u: '40g', s: true, e: '🫙', c: 'Skin Care' },
      { n: 'Savlon', b: 'ICI', p: 68, u: '100ml', s: true, e: '🩹', c: 'First Aid' },
      { n: 'Dettol Liquid', b: 'Reckitt', p: 95, u: '250ml', s: true, e: '🧪', c: 'First Aid' },
      { n: 'Band-Aid', b: 'J&J', p: 55, u: '20 pcs', s: true, e: '🩹', c: 'First Aid' },
      { n: "Johnson's Baby Powder", b: "Johnson's", p: 155, u: '200g', s: true, e: '👶', c: 'Baby Care' },
      { n: 'Pampers Newborn', b: 'P&G', p: 349, u: '22 pcs', s: true, e: '👶', c: 'Baby Care' },
      { n: 'Colgate Total', b: 'Colgate', p: 99, u: '150g', s: true, e: '🪥', c: 'General Store' },
      { n: 'Dettol Soap', b: 'Reckitt', p: 48, u: '75g', s: true, e: '🧼', c: 'General Store' },
      { n: 'Surf Excel', b: 'HUL', p: 85, u: '500g', s: true, e: '🫧', c: 'General Store' },
    ];
    const _live = mmGetLiveProducts();
    const PRODS = _live
      ? _live.map(p => ({ n: p.name, b: p.brand || '', p: p.price, u: p.unit || '', s: !!p.inStock, e: p.emoji || '💊', c: mmCatLabel(p.cat) }))
      : STATIC_PRODS;

    const fmt = p => `${p.e || '💊'} **${p.n}**${p.b ? ' (' + p.b + ')' : ''} — ₹${p.p}/${p.u} ${p.s ? '✅' : '❌'}`;
    const catReply = (label, emoji, heading) => {
      let items = PRODS.filter(p => p.c === label && p.s);     // prefer in-stock
      if (!items.length) items = PRODS.filter(p => p.c === label); // else include out-of-stock
      if (!items.length) return null;
      return `${emoji} ${heading}:\n` + items.slice(0, 6).map(fmt).join('\n');
    };

    // greeting
    if (/^(hi|hello|hey|hii|namaste|kem cho|namaskar|helo|good morning|good evening)/.test(q))
      return '👋 Hello! Welcome to **Mamta Medical**! I can help you with product prices, availability, medicines, and store info. What are you looking for today?';

    // hours
    if (/hour|time|open|close|timing|kab|baje|samay|waqt/.test(q))
      return '🕗 We are open **Monday to Sunday, 8:30 AM – 8:30 PM**.\n⚠️ On the last day of every month we close early at 2:00 PM.';

    // location
    if (/where|address|location|road|khatlwada|kahan|kidhar|naksha|map/.test(q))
      return '📍 We are at **Main Bazar Road, Khatlwada – 396120, Gujarat**.\nCome visit us — open every day!';

    // delivery
    if (/deliver|home|send|ship|courier|ghar pe|ghar tak/.test(q))
      return '🏪 We do not offer home delivery right now. Please **visit our store** at Main Bazar Road, Khatlwada. We are open 8:30 AM – 8:30 PM every day!';

    // contact — only if explicitly asked
    if (/contact|phone|number|call|whatsapp|speak|talk|baat|sampark/.test(q))
      return `📞 You can reach us at **${WA_PHONE}**.\nWe are available during store hours — 8:30 AM to 8:30 PM.`;

    // how to get product
    if (/how to get|kaise milega|kahan milega|get this|purchase|buy|kharidna/.test(q))
      return '🏪 Simply **visit our store** at Main Bazar Road, Khatlwada. We are open every day 8:30 AM – 8:30 PM. Just walk in and ask!';

    // fever/pain
    if (/fever|bukhar|temperature|paracetamol|crocin|dolo|combiflam|pain|dard|headache|sir dard/.test(q))
      return catReply('Fever & Pain', '💊', 'For fever and pain, we have') || '💊 Please visit our store for fever and pain relief options.';

    // cold/cough
    if (/cold|cough|khasi|nazla|sardi|vicks|nasal|runny/.test(q))
      return catReply('Fever & Pain', '🤧', 'For cold, cough and fever, we have') || '🤧 Visit us at Main Bazar Road for cold and cough remedies.';

    // vitamins
    if (/vitamin|supplement|calcium|zinc|revital|supradyn|neurobion|limcee|immunity/.test(q))
      return catReply('Vitamins', '🌿', 'Vitamins and supplements') || '🌿 Visit us for vitamins and supplements.';

    // skin care
    if (/skin|face|cream|lotion|moisturizer|body|cetaphil|himalaya|boroline|lacto/.test(q))
      return catReply('Skin Care', '🧴', 'Skin care products available') || '🧴 Visit us for skin care products.';

    // baby
    if (/baby|infant|child|johnson|pampers|cerelac|baby oil|nappy|diaper/.test(q))
      return catReply('Baby Care', '👶', 'Baby care products') || '👶 Visit us for baby care products.';

    // diabetes
    if (/diabetes|sugar|glucon|accu.chek|diabetic|insulin|blood sugar/.test(q))
      return catReply('Diabetes', '🩺', 'Diabetes products available') || '🩺 Visit us for diabetes care products.';

    // first aid
    if (/first aid|wound|cut|burn|bandage|dettol|savlon|antiseptic|burnol/.test(q))
      return catReply('First Aid', '🩹', 'First aid items') || '🩹 Visit us for first aid supplies.';

    // general store
    if (/colgate|surf|dettol soap|lifebuoy|lizol|tata salt|scotch|good knight|toothpaste/.test(q))
      return catReply('General Store', '🛒', 'General store items available') || '🛒 Visit us for general store items.';

    // product search by name
    const found = PRODS.filter(p =>
      p.n.toLowerCase().includes(q.split(' ')[0]) ||
      q.includes(p.n.toLowerCase().split(' ')[0]) ||
      (p.b && p.b.toLowerCase().includes(q))
    );
    if (found.length === 1) {
      const p = found[0];
      return `${p.e} **${p.n}**${p.b ? ' by ' + p.b : ''}\n• Price: **₹${p.p} / ${p.u}**\n• Status: ${p.s ? '✅ In Stock' : '❌ Out of Stock'}\n• Category: ${p.c}\n${p.s ? 'Available at our store — visit us at Main Bazar Road!' : 'Currently out of stock. Please visit to check for alternatives.'}`;
    }
    if (found.length > 1) {
      return `Found ${found.length} products:\n` + found.slice(0, 3).map(p => `${p.e} **${p.n}** — ₹${p.p}/${p.u} (${p.s ? 'In Stock' : 'Out of Stock'})`).join('\n');
    }

    return null; // cannot answer locally
  }

  /* ── TURNSTILE (human check) ──
     Loads on demand and returns a fresh single-use token, or null if
     disabled / unavailable. Enforcement happens server-side in the Worker. */
  let _tsWidgetId = null, _tsLoad = null, _tsResolve = null;
  function _tsSettle(tok) { if (_tsResolve) { const r = _tsResolve; _tsResolve = null; r(tok || null); } }
  function loadTurnstile() {
    if (_tsLoad) return _tsLoad;
    _tsLoad = new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      const sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      sc.async = true; sc.defer = true;
      sc.onload = () => resolve();
      sc.onerror = () => reject(new Error('turnstile_load_failed'));
      document.head.appendChild(sc);
    });
    return _tsLoad;
  }
  async function getTurnstileToken() {
    if (!TURNSTILE_SITEKEY) return null;            // disabled
    try { await loadTurnstile(); } catch (e) { return null; }
    if (!window.turnstile) return null;
    return new Promise((resolve) => {
      _tsResolve = resolve;
      setTimeout(() => _tsSettle(null), 8000);      // don't hang the chat
      try {
        if (_tsWidgetId === null) {
          let box = document.getElementById('mmTurnstile');
          if (!box) {
            box = document.createElement('div');
            box.id = 'mmTurnstile';
            box.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
            document.body.appendChild(box);
          }
          _tsWidgetId = window.turnstile.render(box, {
            sitekey: TURNSTILE_SITEKEY,
            size: 'invisible',
            callback: _tsSettle,
            'error-callback': () => _tsSettle(null)
          });
        } else {
          window.turnstile.reset(_tsWidgetId);
          window.turnstile.execute(_tsWidgetId);
        }
      } catch (e) { _tsSettle(null); }
    });
  }

  /* ─────────────────────────────────
     AI PROXY CALL
     Sends the conversation to the Cloudflare Worker, which holds the
     Groq/Gemini keys and handles the Groq → Gemini fallback itself.
  ───────────────────────────────── */
  async function callProxy(messages, turnstileToken) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(AI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, turnstileToken: turnstileToken || null }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('proxy_error_' + res.status);
      const data = await res.json();
      const reply = (data.text || '').trim();
      if (!reply) throw new Error('empty_proxy');
      return { text: reply, provider: data.provider || 'AI' };
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  /* ─────────────────────────────────
     MAIN AI ORCHESTRATOR
     Proxy (Groq → Gemini) → Local → (WA only if asked)
  ───────────────────────────────── */
  async function getAIReply(userMessage) {
    // build messages array with system prompt
    const systemMsg = { role: 'system', content: buildSystemPrompt() };
    const msgs = [systemMsg, ...history, { role: 'user', content: userMessage }];

    // 1️⃣ Try the AI proxy (Groq → Gemini, keys held server-side in the Worker)
    try {
      const tsToken = await getTurnstileToken();   // null when bot-check is off
      return await callProxy(msgs, tsToken);
    } catch (e1) {
      console.log('AI proxy failed:', e1.message, '→ using local AI');
    }

    // 2️⃣ Local AI fallback
    const local = localAI(userMessage);
    if (local) return { text: local, provider: 'Local' };

    // 4️⃣ Cannot answer — but still NO WhatsApp unless asked
    return {
      text: "I couldn't find specific information about that. Could you rephrase your question? I can help with product prices, availability, store hours, and general medicine info.",
      provider: 'Local'
    };
  }

  /* ─────────────────────────────────
     HANDLE INPUT
  ───────────────────────────────── */
  async function handleInput(text) {
    text = text.trim();
    if (!text) return;

    clearQuick();
    addBubble('user', text.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    const inp = document.getElementById('mmInput');
    if (inp) { inp.value = ''; autoResize(); }

    // check if customer is explicitly asking for WhatsApp/contact
    const wantsContact = /whatsapp|call|phone|contact|speak to|talk to|owner|someone|staff|baat karna|sampark|number do/.test(text.toLowerCase());
    if (wantsContact) {
      showWaOption(text);
      setQuick(['Ask about a product', 'Store hours', 'Product prices']);
      return;
    }

    // show typing
    addTyping();
    const sendBtn = document.getElementById('mmSend');
    sendBtn.classList.add('loading');
    document.getElementById('mmStatus').textContent = '● Thinking…';

    try {
      const { text: reply, provider } = await getAIReply(text);

      // save to history
      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: reply });
      // keep history manageable — last 10 turns
      if (history.length > 20) history = history.slice(-20);

      removeTyping();
      sendBtn.classList.remove('loading');
      document.getElementById('mmStatus').textContent = '● AI powered · Always here to help';
      failCount = 0;

      // render — escape first (neutralise any raw HTML), then apply markdown
      const html = esc(reply)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');

      addBubble('bot', html, provider);

      // smart quick replies — NEVER include WhatsApp option proactively
      const lower = reply.toLowerCase();
      const quick = [];
      if (lower.includes('stock') || lower.includes('available')) quick.push('Any alternatives?');
      if (lower.includes('price') || lower.includes('₹')) quick.push('What is it used for?');
      if (!lower.includes('8:30') && !lower.includes('hour')) quick.push('Store timings?');
      if (!lower.includes('khatlwada') && !lower.includes('address')) quick.push('Store location?');
      if (lower.includes('out of stock')) quick.push('Suggest similar product');
      if (quick.length) setQuick(quick.slice(0, 3));

    } catch (err) {
      removeTyping();
      sendBtn.classList.remove('loading');
      document.getElementById('mmStatus').textContent = '● AI powered · Always here to help';
      failCount++;

      // try local one more time
      const local = localAI(text);
      if (local) {
        const html = local.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
        addBubble('bot', html, 'Local');
        failCount = 0;
        setQuick(['More questions?', 'Store hours?', 'Store location?']);
        return;
      }

      if (failCount >= 3) {
        // after 3 failures — suggest rephrasing, still no WhatsApp
        addBubble('bot',
          "I'm having a bit of trouble understanding that. Try asking something like:<br/>" +
          "<strong>\"Do you have Crocin?\"</strong> or <strong>\"Medicine for fever?\"</strong> or <strong>\"Store hours?\"</strong>"
        );
        failCount = 0;
        setQuick(['Do you have Crocin?', 'Medicine for fever?', 'Store hours?', 'Store location?']);
      } else {
        addBubble('bot', "Sorry, I had a small hiccup. Please try asking again!");
        setQuick(['Try again', 'Store hours?', 'Product prices?']);
      }
    }
  }

  /* ─────────────────────────────────
     OPEN / CLOSE
  ───────────────────────────────── */
  let contextProduct = null;

  function openChat(product = null) {
    contextProduct = product;
    history = [];
    failCount = 0;
    waShown = false;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    msgEl().innerHTML = '';
    clearQuick();

    setTimeout(() => {
      if (product) {
        addProductCard(product);
        setTimeout(() => {
          const inStock = product.inStock !== false;
          const intro = inStock
            ? `You are looking at <strong>${product.name}</strong> — it is <strong style="color:var(--g,#00e571)">in stock at ₹${product.price || '—'}</strong>. Ask me anything about it — dosage, usage, alternatives, or anything else!`
            : `<strong>${product.name}</strong> is currently <strong style="color:#ff6060">out of stock</strong>. I can suggest similar alternatives for you!`;
          addBubble('bot', intro);
          setQuick(inStock
            ? ['What is it used for?', 'Any side effects?', 'Dosage?', 'Any cheaper option?']
            : ['Suggest alternatives', 'When will it be back?', 'Similar products?']
          );
        }, 300);
      } else {
        addBubble('bot',
          '👋 Hello! I am your <strong>Mamta Medical Assistant</strong>.<br/><br/>' +
          'Ask me about medicines, prices, availability, store hours — I am here to help! ' +
          'You can also type in <strong>Hindi or Gujarati</strong>.'
        );
        setQuick(['Medicine for fever?', 'Vitamins available?', 'Store timings?', 'Store location?']);
      }
    }, 200);

    setTimeout(() => {
      const inp = document.getElementById('mmInput');
      if (inp && window.innerWidth > 560) inp.focus();
    }, 500);
  }

  function closeChat() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ─────────────────────────────────
     INPUT EVENTS
  ───────────────────────────────── */
  function autoResize() {
    const inp = document.getElementById('mmInput');
    if (!inp) return;
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 100) + 'px';
  }

  document.getElementById('mmClose').addEventListener('click', closeChat);
  document.getElementById('mmClear').addEventListener('click', () => {
    history = []; failCount = 0; waShown = false;
    msgEl().innerHTML = ''; clearQuick();
    addBubble('bot', 'Chat cleared! How can I help you? 😊');
    setQuick(['Medicine for fever?', 'Vitamins?', 'Store timings?', 'Store location?']);
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeChat(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeChat(); });

  document.getElementById('mmSend').addEventListener('click', () => {
    const inp = document.getElementById('mmInput');
    if (inp) handleInput(inp.value);
  });
  document.getElementById('mmInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const inp = document.getElementById('mmInput');
      if (inp) handleInput(inp.value);
    }
  });
  document.getElementById('mmInput').addEventListener('input', autoResize);

  /* ─────────────────────────────────
     INTERCEPT ALL WA CLICKS
     Open chat instead of WhatsApp
  ───────────────────────────────── */
  document.addEventListener('click', e => {
    const el = e.target.closest('a, button');
    if (!el) return;
    if (el.closest('#mmOverlay')) return; // inside chatbot — let it through

    const href = el.getAttribute('href') || '';
    const isWaTrigger =
      href.includes('wa.me') ||
      el.classList.contains('p-order') ||
      el.classList.contains('vn-btn') ||
      el.classList.contains('nav-wa') ||
      el.classList.contains('footer-wa') ||
      el.classList.contains('float-wa') ||
      el.classList.contains('c-wa-card') ||
      (el.classList.contains('btn-primary') && href.includes('wa.me'));

    if (!isWaTrigger) return;

    e.preventDefault();
    e.stopPropagation();

    // get product context if clicked from a product card
    let product = null;
    const card = el.closest('.p-card');
    if (card) {
      const nameEl = card.querySelector('.p-name');
      if (nameEl) {
        const pname = nameEl.textContent.trim();
        product = (window.__mmProducts || []).find(p => p.name === pname) || { name: pname };
        if (!product.price) {
          const priceEl = card.querySelector('.p-price');
          if (priceEl) product.price = priceEl.textContent.replace(/[^\d]/g, '');
        }
        product.inStock = !card.classList.contains('oos');
        const imgEl = card.querySelector('.p-photo');
        if (imgEl) product.photoUrl = imgEl.src;
        product.emoji = card.querySelector('.p-emoji')?.textContent || '💊';
      }
    }

    openChat(product);
  }, true);

  /* expose globally */
  window.mmOpenChat = openChat;

})();