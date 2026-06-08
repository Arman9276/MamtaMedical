/* ═══════════════════════════════════════════════════════════
   MAMTA MEDICAL — AI PROXY (Cloudflare Worker)

   Holds the Groq and Gemini API keys as ENCRYPTED SECRETS so they
   never reach the browser. The website (chatbot.js) POSTs the chat
   messages here; this Worker calls Groq first, falls back to Gemini,
   and returns { text, provider }.

   ── Setup (one time, all free) ──────────────────────────────
     npm install -g wrangler        # or use:  npx wrangler ...
     npx wrangler login
     npx wrangler deploy
     npx wrangler secret put GROQ_KEY     # paste a NEW Groq key
     npx wrangler secret put GEMINI_KEY   # paste a NEW Gemini key

   Then copy the deployed https://...workers.dev URL into
   chatbot.js → const AI_PROXY_URL.

   Optional: set ALLOWED_ORIGIN in wrangler.toml to your site URL so
   only your site can use the proxy.
═══════════════════════════════════════════════════════════ */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const PROVIDER_TIMEOUT_MS = 8000;
const MAX_MESSAGES = 40;
const MAX_PAYLOAD_CHARS = 60000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: 'bad_json' }, 400, cors); }

    const messages = payload && payload.messages;
    if (!Array.isArray(messages) || messages.length === 0) return json({ error: 'no_messages' }, 400, cors);
    if (messages.length > MAX_MESSAGES) return json({ error: 'too_many_messages' }, 400, cors);
    if (JSON.stringify(messages).length > MAX_PAYLOAD_CHARS) return json({ error: 'payload_too_large' }, 413, cors);

    if (!env.GROQ_KEY && !env.GEMINI_KEY) return json({ error: 'not_configured' }, 500, cors);

    // Human check (optional): only enforced when TURNSTILE_SECRET is set.
    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(payload.turnstileToken, env.TURNSTILE_SECRET,
        request.headers.get('CF-Connecting-IP'));
      if (!ok) return json({ error: 'human_check_failed' }, 403, cors);
    }

    // 1) Groq first
    if (env.GROQ_KEY) {
      try { return json(await callGroq(messages, env.GROQ_KEY), 200, cors); }
      catch (e) { /* fall through to Gemini */ }
    }
    // 2) Gemini fallback
    if (env.GEMINI_KEY) {
      try { return json(await callGemini(messages, env.GEMINI_KEY), 200, cors); }
      catch (e) { /* fall through */ }
    }
    // 3) Both failed — client will use its offline localAI()
    return json({ error: 'all_providers_failed' }, 502, cors);
  }
};

async function callGroq(messages, key) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages,
        temperature: 0.6,
        max_tokens: 300,
        top_p: 0.9,
      }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error('groq_' + res.status);
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content || '';
    if (!reply) throw new Error('empty_groq');
    return { text: reply.trim(), provider: 'Groq · Llama 4' };
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(messages, key) {
  // Pass the system prompt to Gemini as system_instruction (the old client
  // code dropped it). Other turns are mapped to Gemini's content format.
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const body = {
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 300, topP: 0.9 }
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(GEMINI_URL + '?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) throw new Error('gemini_' + res.status);
    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!reply) throw new Error('empty_gemini');
    return { text: reply.trim(), provider: 'Gemini 2.0' };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyTurnstile(token, secret, ip) {
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: form
    });
    const data = await res.json();
    return data && data.success === true;
  } catch (e) {
    return false;
  }
}

function corsHeaders(origin, allowed) {
  let allow = '*';
  if (allowed && allowed !== '*') {
    const list = allowed.split(',').map(s => s.trim());
    allow = list.includes(origin) ? origin : list[0];
  } else if (origin) {
    allow = origin;
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}
