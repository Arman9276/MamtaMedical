import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
        import { getFirestore, collection, getDocs, query, orderBy, onSnapshot, where, addDoc, serverTimestamp }
            from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';
        import { FIREBASE_CONFIG, WA_NUM } from './config.js';

        const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

        const app = initializeApp(FIREBASE_CONFIG);
        const db = getFirestore(app);

        /* ── HTML ESCAPE (stored data is rendered via innerHTML) ── */
        function esc(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        /* ── CLOUDINARY: serve compressed, right-sized images (cuts image bandwidth ~80%) ── */
        function cldImg(url, width) {
            if (!url || url.indexOf('/upload/') === -1) return url;          // not a Cloudinary URL → leave untouched
            if (/\/upload\/[^/]*(f_auto|q_auto|w_\d)/.test(url)) return url; // already transformed → don't double up
            return url.replace('/upload/', '/upload/f_auto,q_auto,w_' + width + '/');
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
        // Theme is already applied before paint by the inline <head> script.
        // Sync the toggle icon only — do NOT re-save, so it keeps following the system.
        themeIcon.textContent = html.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
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
                return `<div class="p-card${p.inStock ? '' : ' oos'}" data-id="${esc(p.id)}" style="animation-delay:${Math.min(i * .04, .4)}s">
      ${!p.inStock ? '<span class="oos-badge">Out of Stock</span>' : ''}
      ${p.photoUrl
                        ? `<img class="p-photo" src="${esc(cldImg(p.photoUrl, 400))}" alt="${esc(p.name)}" loading="lazy"/>`
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
        function loadProducts() {
            const cached = getCache('mm-products-cache-v2');
            if (cached) {
                allProducts = cached;
                showProducts();
                render();
            }
            // Live listener: always reflects current Firestore data (including stock
            // changes), so the customer view updates in real time and can never get
            // stuck on a stale "out of stock" cache.
            onSnapshot(query(collection(db, 'products'), orderBy('createdAt', 'desc')),
                snap => {
                    const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    saveCache('mm-products-cache-v2', fresh);
                    allProducts = fresh;
                    window.__mmProducts = fresh; // expose for chatbot
                    const ca = document.getElementById('countAll');
                    if (ca) ca.textContent = fresh.length;
                    showProducts();
                    render();
                },
                err => { console.warn('Products listener failed, using cache:', err); }
            );
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



        /* ── PRODUCT DETAIL MODAL ── */
        const pdOverlay = document.getElementById('pdOverlay');
        let currentProduct = null;

        function openDetail(p) {
            if (!p) return;

            // media: real photo if available, else the emoji
            document.getElementById('pdMedia').innerHTML = p.photoUrl
                ? `<img src="${esc(cldImg(p.photoUrl, 800))}" alt="${esc(p.name)}"/>`
                : `<span class="pd-emoji">${esc(p.emoji || '💊')}</span>`;

            // category pill
            const catEl = document.getElementById('pdCat');
            catEl.textContent = catLabel(p.cat);
            catEl.classList.toggle('gen', p.cat === 'general');

            // out-of-stock badge
            document.getElementById('pdOos').hidden = !!p.inStock;

            // name / brand / price
            document.getElementById('pdName').textContent = p.name || '';
            document.getElementById('pdBrand').textContent = p.brand || '';
            document.getElementById('pdPrice').innerHTML =
                `₹${esc(p.price)}<span class="p-unit">/ ${esc(p.unit || '')}</span>`;

            // description — owner-authored rich text from the admin panel.
            // Writes are restricted to the owner by firestore.rules, so this
            // HTML is trusted (same trust model the admin editor already uses).
            const descEl = document.getElementById('pdDesc');
            const plain = (p.desc || '').replace(/<[^>]*>/g, '').trim();
            if (plain.length) {
                descEl.innerHTML = p.desc;
                descEl.classList.remove('empty');
            } else {
                descEl.textContent = 'No additional details available — tap Enquire to ask us about this product.';
                descEl.classList.add('empty');
            }

            // WhatsApp enquire button
            const order = document.getElementById('pdOrder');
            const label = document.getElementById('pdOrderLabel');
            if (p.inStock) {
                const waMsg = encodeURIComponent('Hi Mamta Medical, I would like to enquire about: ' + p.name + (p.unit ? ' (' + p.unit + ')' : '') + '. Is it available at the store?');
                order.href = 'https://wa.me/' + WA_NUM + '?text=' + waMsg;
                order.classList.remove('disabled');
                order.removeAttribute('tabindex');
                label.textContent = 'Enquire on WhatsApp';
            } else {
                order.href = '#';
                order.classList.add('disabled');
                order.setAttribute('tabindex', '-1');
                label.textContent = 'Currently Unavailable';
            }

            pdOverlay.classList.add('open');
            pdOverlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            document.getElementById('pdClose').focus();

            // reviews
            currentProduct = p;
            resetReviewForm();
            document.getElementById('pdReviewForm').hidden = true;
            loadReviews(p.id);
        }

        function closeDetail() {
            pdOverlay.classList.remove('open');
            pdOverlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }

        // open when a card is tapped — but let the card's own Enquire link work
        document.getElementById('productsGrid').addEventListener('click', e => {
            if (e.target.closest('.p-order')) return;
            const card = e.target.closest('.p-card');
            if (!card) return;
            openDetail(allProducts.find(x => x.id === card.dataset.id));
        });

        document.getElementById('pdClose').addEventListener('click', closeDetail);
        pdOverlay.addEventListener('click', e => { if (e.target === pdOverlay) closeDetail(); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && pdOverlay.classList.contains('open')) closeDetail();
        });

        /* ── REVIEWS ── */
        // a row of filled/empty stars for a given (rounded) value
        function starRow(n) {
            n = Math.round(n || 0);
            let s = '';
            for (let i = 1; i <= 5; i++) s += (i <= n ? '★' : '☆');
            return s;
        }

        async function loadReviews(pid) {
            const summary = document.getElementById('pdRatingSummary');
            const listEl = document.getElementById('pdReviewList');
            summary.innerHTML = '<span class="pd-rev-muted">Loading reviews…</span>';
            listEl.innerHTML = '';
            try {
                // two equality filters, no orderBy → no composite index needed.
                // The approved==true filter is also what the security rules require.
                const snap = await getDocs(query(
                    collection(db, 'reviews'),
                    where('productId', '==', pid),
                    where('approved', '==', true)
                ));
                const reviews = snap.docs.map(d => d.data());
                // newest first, sorted client-side
                reviews.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                renderReviewSummary(reviews);
                renderReviewList(reviews);
            } catch (e) {
                summary.innerHTML = '<span class="pd-rev-muted">Couldn’t load reviews.</span>';
            }
        }

        function renderReviewSummary(reviews) {
            const summary = document.getElementById('pdRatingSummary');
            if (!reviews.length) {
                summary.innerHTML = '<span class="pd-rev-muted">No reviews yet — be the first!</span>';
                return;
            }
            const avg = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length;
            summary.innerHTML =
                `<span class="pd-rev-stars">${starRow(avg)}</span>` +
                `<span class="pd-rev-avg">${avg.toFixed(1)}</span>` +
                `<span class="pd-rev-count">(${reviews.length} review${reviews.length > 1 ? 's' : ''})</span>`;
        }

        function renderReviewList(reviews) {
            // name + text are PUBLIC, untrusted input → always escaped
            document.getElementById('pdReviewList').innerHTML = reviews.map(r => `
    <div class="pd-review">
      <div class="pd-review-head">
        <span class="pd-review-name">${esc(r.name)}</span>
        <span class="pd-review-stars">${starRow(r.rating)}</span>
      </div>
      <p class="pd-review-text">${esc(r.text)}</p>
      <span class="pd-review-date">${r.createdAt?.toDate?.()?.toLocaleDateString('en-IN') || ''}</span>
    </div>`).join('');
        }

        // build the interactive star picker once
        (function initStarInput() {
            const wrap = document.getElementById('pdStarInput');
            for (let i = 1; i <= 5; i++) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'pd-star';
                b.dataset.val = i;
                b.textContent = '★';
                b.setAttribute('aria-label', i + (i > 1 ? ' stars' : ' star'));
                wrap.appendChild(b);
            }
            wrap.addEventListener('click', e => {
                const b = e.target.closest('.pd-star');
                if (!b) return;
                wrap.dataset.rating = b.dataset.val;
                wrap.querySelectorAll('.pd-star').forEach(s =>
                    s.classList.toggle('on', Number(s.dataset.val) <= Number(b.dataset.val)));
            });
        })();

        function resetReviewForm() {
            document.getElementById('pdRevName').value = '';
            document.getElementById('pdRevText').value = '';
            const wrap = document.getElementById('pdStarInput');
            wrap.dataset.rating = '0';
            wrap.querySelectorAll('.pd-star').forEach(s => s.classList.remove('on'));
            const msg = document.getElementById('pdRevMsg');
            msg.textContent = '';
            msg.className = 'pd-form-msg';
        }

        document.getElementById('pdReviewToggle').addEventListener('click', () => {
            const form = document.getElementById('pdReviewForm');
            form.hidden = !form.hidden;
        });

        document.getElementById('pdRevSubmit').addEventListener('click', async () => {
            if (!currentProduct) return;
            const name = document.getElementById('pdRevName').value.trim();
            const text = document.getElementById('pdRevText').value.trim();
            const rating = Number(document.getElementById('pdStarInput').dataset.rating || 0);
            const msg = document.getElementById('pdRevMsg');

            // client-side checks mirror the Firestore rules (UX only — rules enforce)
            if (rating < 1 || rating > 5) { msg.textContent = 'Please pick a star rating.'; msg.className = 'pd-form-msg err'; return; }
            if (name.length < 2) { msg.textContent = 'Please enter your name (at least 2 characters).'; msg.className = 'pd-form-msg err'; return; }
            if (text.length < 3) { msg.textContent = 'Please write a short review (at least 3 characters).'; msg.className = 'pd-form-msg err'; return; }

            const btn = document.getElementById('pdRevSubmit');
            btn.disabled = true; btn.textContent = 'Submitting…';
            try {
                await addDoc(collection(db, 'reviews'), {
                    productId: currentProduct.id,
                    name, rating, text,
                    approved: false,              // never self-published — matches the rules
                    createdAt: serverTimestamp()  // server sets the time — matches the rules
                });
                msg.textContent = '✅ Thanks! Your review will appear once approved.';
                msg.className = 'pd-form-msg ok';
                resetReviewForm();
                setTimeout(() => {
                    document.getElementById('pdReviewForm').hidden = true;
                    msg.textContent = ''; msg.className = 'pd-form-msg';
                }, 3000);
            } catch (e) {
                msg.textContent = 'Could not submit — please try again.';
                msg.className = 'pd-form-msg err';
            } finally {
                btn.disabled = false; btn.textContent = 'Submit review';
            }
        });

        /* ── INIT ── */
        loadProducts();
        loadAnnouncements();
