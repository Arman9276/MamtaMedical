import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
        import { getFirestore, collection, getDocs, query, orderBy, onSnapshot }
            from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';
        import { FIREBASE_CONFIG, WA_NUM } from './config.js';

        const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

        const app = initializeApp(FIREBASE_CONFIG);
        const db = getFirestore(app);

        /* ── HTML ESCAPE (stored data is rendered via innerHTML) ── */
        function esc(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        /* ── THEME ── */
        const html = document.documentElement;
        const themeBtn = document.getElementById('themeBtn');
        const themeIcon = document.getElementById('themeIcon');
        const metaTheme = document.getElementById('themeColor');
        function setTheme(t) {
            html.setAttribute('data-theme', t);
            themeIcon.textContent = t === 'dark' ? '☀️' : '🌙';
            metaTheme.setAttribute('content', t === 'dark' ? '#060f1e' : '#f0f5f0');
            try { localStorage.setItem('mm-theme', t); } catch (e) { }
        }
        try { setTheme(localStorage.getItem('mm-theme') || (window.matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark')); }
        catch (e) { setTheme('dark'); }
        themeBtn.addEventListener('click', () => setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

        /* ── NAV SCROLL ── */
        window.addEventListener('scroll', () => {
            document.getElementById('mainNav').classList.toggle('scrolled', window.scrollY > 20);
        }, { passive: true });

        /* ── HAMBURGER ── */
        const menuBtn = document.getElementById('menuBtn');
        const mobileMenu = document.getElementById('mobileMenu');
        function closeMenu() { mobileMenu.classList.remove('open'); menuBtn.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
        menuBtn.addEventListener('click', () => { var o = mobileMenu.classList.toggle('open'); menuBtn.classList.toggle('open', o); menuBtn.setAttribute('aria-expanded', String(o)); });
        mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
        document.addEventListener('click', e => { if (!mobileMenu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu(); });

        /* ── CACHE ── */
        function saveCache(key, data) {
            try {
                const cacheVersion = localStorage.getItem('mm-cache-version') || '0';
                localStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + CACHE_TTL, version: cacheVersion }));
            } catch (e) { }
        }
        function getCache(key) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                const cached = JSON.parse(raw);
                const currentVersion = localStorage.getItem('mm-cache-version') || '0';
                if (Date.now() > cached.expiry) return null;
                if (cached.version !== currentVersion) return null;
                return cached.data;
            } catch (e) { return null; }
        }

        /* ── STATE ── */
        var allProducts = [];
        var state = { query: '', cat: 'all', sort: 'default' };

        /* ── FILTER ── */
        function getFiltered() {
            var q = state.query.toLowerCase().trim();
            var list = allProducts.filter(p => {
                var matchCat = state.cat === 'all' || p.cat === state.cat;
                var matchQ = !q || p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q);
                return matchCat && matchQ;
            });
            if (state.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
            if (state.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
            if (state.sort === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name));
            return list;
        }

        /* ── RENDER ── */
        function catLabel(c) {
            const m = { 'fever-pain': 'Fever & Pain', 'vitamins': 'Vitamins', 'skin': 'Skin Care', 'diabetes': 'Diabetes', 'baby': 'Baby Care', 'first-aid': 'First Aid', 'general': 'General Store' };
            return m[c] || c;
        }
        function render() {
            const list = getFiltered();
            const grid = document.getElementById('productsGrid');
            const empty = document.getElementById('emptyState');
            document.getElementById('resultCount').textContent = list.length;
            if (!list.length) { empty.classList.add('show'); grid.innerHTML = ''; return; }
            empty.classList.remove('show');
            const isGen = p => p.cat === 'general';
            grid.innerHTML = list.map((p, i) => {
                const waMsg = encodeURIComponent('Hi Mamta Medical, I would like to enquire about: ' + p.name + (p.unit ? ' (' + p.unit + ')' : '') + '. Is it available at the store?');
                return `<div class="p-card${p.inStock ? '' : ' oos'}" style="animation-delay:${Math.min(i * .04, .4)}s">
      ${!p.inStock ? '<span class="oos-badge">Out of Stock</span>' : ''}
      ${p.photoUrl
                        ? `<img class="p-photo" src="${esc(p.photoUrl)}" alt="${esc(p.name)}" loading="lazy"/>`
                        : `<span class="p-emoji">${esc(p.emoji || '💊')}</span>`}
      <span class="p-cat${isGen(p) ? ' gen' : ''}">${esc(catLabel(p.cat))}</span>
      <div class="p-name">${esc(p.name)}</div>
      <div class="p-brand">${esc(p.brand || '')}</div>
      <div class="p-footer">
        <span class="p-price">₹${esc(p.price)}<span class="p-unit">/ ${esc(p.unit || '')}</span></span>
        <a href="https://wa.me/${WA_NUM}?text=${waMsg}" class="p-order" target="_blank" rel="noopener"
          ${!p.inStock ? 'tabindex="-1" aria-disabled="true"' : ''}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a3.178 3.178 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.106.55 4.083 1.512 5.8L0 24l6.377-1.496A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.886 0-3.655-.518-5.171-1.418l-.371-.22-3.787.889.928-3.682-.241-.381A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
          ${p.inStock ? 'Enquire' : 'N/A'}
        </a>
      </div>
    </div>`;
            }).join('');
        }

        /* ── LOAD PRODUCTS (cache first) ── */
        async function loadProducts() {
            const cached = getCache('mm-products-cache');
            if (cached) {
                allProducts = cached;
                showProducts();
                render();
            }
            // always fetch fresh in background
            try {
                const snap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')));
                const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                saveCache('mm-products-cache', fresh);
                allProducts = fresh;
                window.__mmProducts = fresh; // expose for chatbot
                document.getElementById('countAll').textContent = fresh.length;
                showProducts();
                render();
            } catch (e) { console.warn('Firebase fetch failed, using cache'); }
        }

        function showProducts() {
            document.getElementById('skeletonGrid').style.display = 'none';
            document.getElementById('productsGrid').style.display = 'grid';
        }

        /* ── LOAD ANNOUNCEMENTS ── */
        async function loadAnnouncements() {
            try {
                const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc')));
                const anns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const banner = document.getElementById('annBanner');
                if (!anns.length) { banner.style.display = 'none'; return; }
                const icons = { info: 'ℹ️', warn: '⚠️', danger: '🚨' };
                banner.innerHTML = anns.slice(0, 3).map(a => {
                    const type = ['info', 'warn', 'danger'].includes(a.type) ? a.type : 'info';
                    return `
      <div class="ann-item ${type}">
        <span class="ann-icon">${icons[type]}</span>
        <div class="ann-content"><b>${esc(a.title)}</b> — ${esc(a.body)}</div>
      </div>`;
                }).join('');
            } catch (e) { }
        }

        /* ── EVENTS ── */
        var searchTimer;
        document.getElementById('searchInput').addEventListener('input', function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => { state.query = this.value; document.getElementById('searchClear').classList.toggle('show', !!this.value); render(); }, 200);
        });
        document.getElementById('searchClear').addEventListener('click', () => {
            document.getElementById('searchInput').value = ''; state.query = '';
            document.getElementById('searchClear').classList.remove('show'); render();
        });
        document.getElementById('catPills').addEventListener('click', e => {
            const btn = e.target.closest('.pill'); if (!btn) return;
            document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active'); state.cat = btn.dataset.cat; render();
        });
        document.getElementById('sortSelect').addEventListener('change', function () { state.sort = this.value; render(); });
        window.clearAll = function () {
            document.getElementById('searchInput').value = ''; state.query = '';
            state.cat = 'all'; state.sort = 'default';
            document.getElementById('searchClear').classList.remove('show');
            document.getElementById('sortSelect').value = 'default';
            document.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.cat === 'all'));
            render();
        };

        /* ── FLOAT WA HIDE ON FOOTER ── */
        const floatWa = document.querySelector('.float-wa');
        const footer = document.querySelector('.footer');
        if (floatWa && footer && 'IntersectionObserver' in window) {
            new IntersectionObserver(e => floatWa.classList.toggle('hidden', e[0].isIntersecting), { threshold: .05 }).observe(footer);
        }



        /* ── INIT ── */
        loadProducts();
        loadAnnouncements();
