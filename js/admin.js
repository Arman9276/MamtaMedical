import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithRedirect, signInWithPopup, getRedirectResult, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence }
    from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import {
    getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
    updateDoc, deleteDoc, onSnapshot, serverTimestamp, orderBy, query
}
    from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

/* ── CONFIG ── */
import { FIREBASE_CONFIG } from './config.js';
const OWNER_EMAIL = "armannarsinh08@gmail.com";
const CLOUDINARY_NAME = "dpgoi1sd6";
const CLOUDINARY_PRESET = "mamta_medical";

/* ── INIT ── */
const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

/* ── HTML ESCAPE (stored data is rendered via innerHTML) ── */
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── THEME ── */
const html = document.documentElement;
const themeBtn = document.getElementById('themeBtn');
function setTheme(t) {
    html.setAttribute('data-theme', t);
    themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem('mm-admin-theme', t); } catch (e) { }
}
// Theme is already applied before paint by the inline <head> script.
// Sync the toggle icon only — do NOT re-save, so it keeps following the system.
themeBtn.textContent = html.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
themeBtn.addEventListener('click', () => setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

/* ── TOAST ── */
const toastEl = document.getElementById('toast');
let toastTimer;
function showToast(msg, type = 'success') {
    toastEl.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
    toastEl.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 3000);
}

/* ── AUTH ── */
const provider = new GoogleAuthProvider();
// Handle redirect result on page load
getRedirectResult(auth).then(result => {
    if (result && result.user) {
        if (result.user.email !== OWNER_EMAIL) {
            signOut(auth);
            showLoginError('⛔ Access denied. Only the store owner can log in.');
        }
        // else onAuthStateChanged will handle showing admin
    }
}).catch(e => {
    if (e.message) showLoginError('Login failed: ' + e.message);
});

function showLoginError(msg) {
    const el = document.getElementById('loginError');
    el.style.display = 'block';
    el.textContent = msg;
}

document.getElementById('googleSignInBtn').addEventListener('click', async () => {
    const btn = document.getElementById('googleSignInBtn');
    try {
        btn.innerHTML = '<span style="opacity:.7">Signing in…</span>';
        btn.disabled = true;
        await setPersistence(auth, browserLocalPersistence);
        // Use popup everywhere. signInWithRedirect is unreliable on GitHub
        // Pages because Firebase's auth handler lives on a different domain
        // (…firebaseapp.com), and browsers now block the cross-site storage
        // it needs — so the session never sticks and you bounce back to login.
        const result = await signInWithPopup(auth, provider);
        if (result.user.email !== OWNER_EMAIL) {
            await signOut(auth);
            btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:20px;height:20px"/> Continue with Google';
            btn.disabled = false;
            showLoginError('⛔ Access denied. Only the store owner can log in.');
        }
        // onAuthStateChanged will show the admin panel
    } catch (e) {
        btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:20px;height:20px"/> Continue with Google';
        btn.disabled = false;
        if (e.code === 'auth/popup-blocked') {
            showLoginError('Popup blocked. Please allow popups for this site and try again.');
        } else {
            showLoginError('Login failed: ' + e.message);
        }
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut(auth);
    // clear any cached state and reload so login page is fresh
    sessionStorage.clear();
    location.reload();
});

onAuthStateChanged(auth, user => {
    // clear login intent flag
    sessionStorage.removeItem('mm-login-intent');
    if (user && user.email === OWNER_EMAIL) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminApp').style.display = 'block';
        // user info
        const avatar = document.getElementById('userAvatar');
        const initial = document.getElementById('userInitial');
        if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = 'block'; initial.style.display = 'none'; }
        else { initial.textContent = user.displayName ? user.displayName[0].toUpperCase() : 'A'; }
        document.getElementById('userName').textContent = (user.displayName || '').split(' ')[0];
        initApp();
    } else {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('adminApp').style.display = 'none';
    }
});

/* ── SIDEBAR NAV ── */
window.showSection = function (name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('sec-' + name).classList.add('active');
    document.querySelector('[data-section="' + name + '"]').classList.add('active');
    if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
};
document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
});
// mobile sidebar toggle
const sidebarToggle = document.getElementById('sidebarToggle');
if (window.innerWidth < 768) { sidebarToggle.style.display = 'block'; }
sidebarToggle.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});
window.addEventListener('resize', () => {
    sidebarToggle.style.display = window.innerWidth < 768 ? 'block' : 'none';
});

/* ── CLOUDINARY UPLOAD ── */
async function uploadPhoto(file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    fd.append('folder', 'mamta-medical');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.secure_url) return data.secure_url;
    throw new Error('Upload failed');
}

/* ── PHOTO PREVIEW ── */
document.getElementById('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const area = document.getElementById('photoUploadArea');
    const preview = document.getElementById('photoPreview');
    const status = document.getElementById('puStatus');

    // show local preview immediately
    const reader = new FileReader();
    reader.onload = ev => {
        preview.src = ev.target.result;
        area.classList.add('has-photo');
    };
    reader.readAsDataURL(file);

    // upload to Cloudinary right away
    status.className = 'pu-status uploading';
    status.textContent = '⏳ Uploading to cloud…';
    try {
        const url = await uploadPhoto(file);
        document.getElementById('photoUrl').value = url;
        status.className = 'pu-status done';
        status.textContent = '✅ Photo uploaded successfully!';
        setTimeout(() => { status.className = 'pu-status'; }, 3000);
    } catch (err) {
        status.className = 'pu-status error';
        status.textContent = '❌ Upload failed: ' + err.message;
        document.getElementById('photoUrl').value = '';
    }
});

// remove photo button
document.getElementById('photoRemove').addEventListener('click', e => {
    e.stopPropagation();
    const area = document.getElementById('photoUploadArea');
    area.classList.remove('has-photo');
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoUrl').value = '';
    document.getElementById('photoInput').value = '';
    document.getElementById('puStatus').className = 'pu-status';
});

/* ── EMOJI PICKER ── */
const EMOJI_LIST = [
    // Medicines
    { label: 'Medicines', emojis: ['💊', '🩺', '🩹', '🩻', '💉', '🩸', '🧬', '🔬', '🏥', '⚕️'] },
    // Health & Wellness
    { label: 'Health', emojis: ['🌿', '🍃', '🌱', '🍀', '🌾', '🫙', '🧴', '🧪', '🫧', '💧'] },
    // Vitamins & Supplements
    { label: 'Vitamins', emojis: ['🍊', '🍋', '🫐', '🍇', '🥝', '🥦', '🥕', '🌻', '🫚', '💪'] },
    // Skin & Personal Care
    { label: 'Skin Care', emojis: ['🧴', '🪥', '🧼', '🪒', '💆', '✨', '🌸', '🪷', '🌺', '💅'] },
    // Baby Care
    { label: 'Baby', emojis: ['👶', '🍼', '🧸', '🪆', '🎀', '🛁', '🧷', '👼', '🌈', '⭐'] },
    // First Aid
    { label: 'First Aid', emojis: ['🩹', '🚑', '🆘', '⚠️', '🔴', '🩺', '🧯', '🪤', '🔦', '🧲'] },
    // General Store
    { label: 'General', emojis: ['🛒', '🧹', '🧽', '🫧', '🧺', '🪣', '🪴', '🕯️', '🔋', '💡'] },
    // Food & Daily
    { label: 'Food & Daily', emojis: ['🧂', '🫙', '🍚', '🫖', '☕', '🥛', '🧃', '🍯', '🌾', '🫘'] },
];

function initEmojiPicker() {
    const grid = document.getElementById('emojiGrid');
    if (!grid) return;
    grid.innerHTML = '';
    EMOJI_LIST.forEach(section => {
        const lbl = document.createElement('div');
        lbl.className = 'emoji-section-label';
        lbl.textContent = section.label;
        grid.appendChild(lbl);
        section.emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'emoji-btn';
            btn.textContent = emoji;
            const currentVal = document.getElementById('pEmoji').value;
            if (emoji === currentVal) btn.classList.add('selected');
            btn.addEventListener('click', () => {
                document.getElementById('pEmoji').value = emoji;
                document.getElementById('emojiSelected').textContent = emoji;
                grid.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
            grid.appendChild(btn);
        });
    });
}

/* ── EMOJI PICKER ── */
document.getElementById('emojiPicker').addEventListener('click', function (e) {
    const btn = e.target.closest('.ep-btn');
    if (!btn) return;
    // deactivate all
    document.querySelectorAll('.ep-btn').forEach(b => b.classList.remove('active'));
    // activate clicked
    btn.classList.add('active');
    // update hidden input + display
    const emoji = btn.dataset.emoji;
    document.getElementById('pEmoji').value = emoji;
    document.getElementById('emojiSelected').textContent = emoji;
});

/* ── RICH TEXT EDITOR ── */
(function () {
    const toolbar = document.querySelector('.rte-toolbar');
    const body = document.getElementById('pDesc');
    const counter = document.getElementById('rteCount');

    // toolbar button clicks
    toolbar.addEventListener('mousedown', e => {
        const btn = e.target.closest('.rte-btn[data-cmd]');
        if (!btn) return;
        e.preventDefault(); // keep focus in editor
        const cmd = btn.dataset.cmd;
        const val = btn.dataset.val || null;
        document.execCommand(cmd, false, val);
        body.focus();
        updateToolbarState();
    });

    // character counter
    body.addEventListener('input', () => {
        const text = body.innerText || '';
        counter.textContent = text.length;
        updateToolbarState();
    });

    // update bold/italic/etc active state
    function updateToolbarState() {
        ['bold', 'italic', 'underline', 'strikeThrough',
            'insertUnorderedList', 'insertOrderedList',
            'justifyLeft', 'justifyCenter', 'justifyRight'].forEach(cmd => {
                const btn = toolbar.querySelector('[data-cmd="' + cmd + '"]');
                if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
            });
    }
    document.addEventListener('selectionchange', updateToolbarState);
})();

/* ── TOGGLE STOCK ── */
window.toggleStock = function (btn) {
    btn.classList.toggle('on');
    document.getElementById('pStockLabel').textContent = btn.classList.contains('on') ? 'In Stock' : 'Out of Stock';
};

/* ── MODAL ── */
window.closeModal = function () {
    document.getElementById('productModal').classList.remove('open');
    document.getElementById('editProductId').value = '';
    document.getElementById('pName').value = '';
    document.getElementById('pBrand').value = '';
    document.getElementById('pCat').value = '';
    document.getElementById('pPrice').value = '';
    document.getElementById('pUnit').value = '';
    document.getElementById('pEmoji').value = '💊';
    document.getElementById('emojiSelected').textContent = '💊';
    const rteEl = document.getElementById('pDesc');
    rteEl.innerHTML = '';
    const cnt = document.getElementById('rteCount');
    if (cnt) cnt.textContent = '0';
    document.getElementById('photoUrl').value = '';
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoUploadArea').classList.remove('has-photo');
    document.getElementById('photoInput').value = '';
    document.getElementById('puStatus').className = 'pu-status';
    document.getElementById('pEmoji').value = '💊';
    document.getElementById('emojiSelected').textContent = '💊';
    document.querySelectorAll('.ep-btn').forEach(b => b.classList.toggle('active', b.dataset.emoji === '💊'));
    document.getElementById('pStock').className = 'toggle on';
    document.getElementById('pStockLabel').textContent = 'In Stock';
};
document.getElementById('addProductBtn').addEventListener('click', () => {
    document.getElementById('modalTitle').textContent = 'Add Product';
    closeModal();
    document.getElementById('productModal').classList.add('open');
    setTimeout(initEmojiPicker, 50);
});
document.getElementById('productModal').addEventListener('click', e => {
    if (e.target === document.getElementById('productModal')) closeModal();
});

/* ── SAVE PRODUCT ── */
document.getElementById('saveProductBtn').addEventListener('click', async () => {
    const name = document.getElementById('pName').value.trim();
    const brand = document.getElementById('pBrand').value.trim();
    const cat = document.getElementById('pCat').value;
    const price = parseFloat(document.getElementById('pPrice').value);
    const unit = document.getElementById('pUnit').value.trim();
    const emoji = document.getElementById('pEmoji').value.trim() || '💊';
    const desc = document.getElementById('pDesc').innerHTML.trim();
    const inStock = document.getElementById('pStock').classList.contains('on');
    const editId = document.getElementById('editProductId').value;

    if (!name || !cat || !price) { showToast('Please fill required fields', 'error'); return; }

    const btn = document.getElementById('saveProductBtn');
    btn.textContent = 'Saving…'; btn.disabled = true;

    try {
        // photo already uploaded on select — just use the stored URL
        let photoUrl = document.getElementById('photoUrl').value || '';

        const data = { name, brand, cat, price, unit, emoji, desc, inStock, photoUrl, updatedAt: serverTimestamp() };

        if (editId) {
            await updateDoc(doc(db, 'products', editId), data);
            showToast('Product updated!');
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, 'products'), data);
            showToast('Product added!');
        }
        closeModal();
        // clear cache version to force customer reload
        try { localStorage.setItem('mm-cache-version', Date.now().toString()); } catch (e) { }
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    } finally {
        btn.textContent = '💾 Save Product'; btn.disabled = false;
    }
});

/* ── DELETE PRODUCT ── */
window.deleteProduct = async function (id) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
        await deleteDoc(doc(db, 'products', id));
        showToast('Product deleted');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
};

/* ── EDIT PRODUCT ── */
window.editProduct = function (idOrProduct) {
    // Accept an id (from the table) and look the product up from the
    // in-memory list, instead of injecting the object into the markup.
    const p = (typeof idOrProduct === 'string')
        ? (allProducts.find(x => x.id === idOrProduct) || null)
        : idOrProduct;
    if (!p) return;
    document.getElementById('modalTitle').textContent = 'Edit Product';
    document.getElementById('editProductId').value = p.id;
    document.getElementById('pName').value = p.name || '';
    document.getElementById('pBrand').value = p.brand || '';
    document.getElementById('pCat').value = p.cat || '';
    document.getElementById('pPrice').value = p.price || '';
    document.getElementById('pUnit').value = p.unit || '';
    document.getElementById('pEmoji').value = p.emoji || '💊';
    // update emoji picker selection
    document.querySelectorAll('.ep-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.emoji === (p.emoji || '💊'));
    });
    document.getElementById('emojiSelected').textContent = p.emoji || '💊';
    const descEl = document.getElementById('pDesc');
    descEl.innerHTML = p.desc || '';
    const descCounter = document.getElementById('rteCount');
    if (descCounter) descCounter.textContent = (descEl.innerText || '').length;
    document.getElementById('photoUrl').value = p.photoUrl || '';
    const area = document.getElementById('photoUploadArea');
    if (p.photoUrl) {
        const img = document.getElementById('photoPreview');
        img.src = p.photoUrl;
        area.classList.add('has-photo');
    } else {
        area.classList.remove('has-photo');
    }
    const stockBtn = document.getElementById('pStock');
    stockBtn.className = 'toggle' + (p.inStock ? ' on' : '');
    document.getElementById('pStockLabel').textContent = p.inStock ? 'In Stock' : 'Out of Stock';
    document.getElementById('productModal').classList.add('open');
    setTimeout(initEmojiPicker, 50);
};

/* ── TOGGLE STOCK QUICK ── */
window.quickToggleStock = async function (id, current) {
    try {
        await updateDoc(doc(db, 'products', id), { inStock: !current, updatedAt: serverTimestamp() });
        showToast(!current ? 'Marked as In Stock' : 'Marked as Out of Stock');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
};

/* ── RENDER PRODUCTS TABLE ── */
function renderProductsTable(products, tbodyId, showActions = true) {
    const tbody = document.getElementById(tbodyId);
    if (!products.length) {
        tbody.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="empty-icon">💊</div><h4>No products yet</h4><p>Add your first product</p></div></td></tr>';
        return;
    }
    tbody.innerHTML = products.map(p => `
    <tr>
      <td>${p.photoUrl
            ? `<img class="p-thumb" src="${esc(p.photoUrl)}" alt="${esc(p.name)}" loading="lazy"/>`
            : `<div class="p-thumb-placeholder">${esc(p.emoji || '💊')}</div>`}</td>
      <td><div class="p-name-cell">${esc(p.name)}</div><div class="p-brand-cell">${esc(p.brand || '')}</div></td>
      <td class="hide-mobile">${esc(catLabel(p.cat))}</td>
      <td class="price-cell">₹${esc(p.price)}<small style="color:var(--muted);font-weight:400"> /${esc(p.unit || '')}</small></td>
      <td><span class="stock-pill ${p.inStock ? 'in' : 'out'}">${p.inStock ? '✓ In Stock' : '✗ Out'}</span></td>
      ${showActions ? `<td><div class="action-btns">
        <button class="btn btn-outline btn-sm" onclick="editProduct('${esc(p.id)}')">✏️</button>
        <button class="btn btn-outline btn-sm" onclick="quickToggleStock('${esc(p.id)}',${p.inStock})">${p.inStock ? '📦 Out' : '✅ In'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${esc(p.id)}')">🗑️</button>
      </div></td>`: ''}
    </tr>`).join('');
}

function catLabel(c) {
    const m = {
        'fever-pain': 'Fever & Pain', 'vitamins': 'Vitamins', 'skin': 'Skin Care',
        'diabetes': 'Diabetes', 'baby': 'Baby Care', 'first-aid': 'First Aid', 'general': 'General Store'
    };
    return m[c] || c || '-';
}

/* ── STOCK TABLE ── */
function renderStockTable(products) {
    const tbody = document.getElementById('stockBody');
    if (!products.length) {
        tbody.innerHTML = '<tr><td colspan="5"><div class="empty"><div class="empty-icon">📦</div><h4>No products</h4></div></td></tr>';
        return;
    }
    tbody.innerHTML = products.map(p => `
    <tr>
      <td><div class="p-name-cell">${esc(p.name)}</div><div class="p-brand-cell">${esc(p.brand || '')}</div></td>
      <td class="hide-mobile">${esc(catLabel(p.cat))}</td>
      <td class="hide-mobile price-cell">₹${esc(p.price)}</td>
      <td><span class="stock-pill ${p.inStock ? 'in' : 'out'}">${p.inStock ? '✓ In Stock' : '✗ Out of Stock'}</span></td>
      <td>
        <button class="toggle ${p.inStock ? 'on' : ''}" onclick="quickToggleStock('${esc(p.id)}',${p.inStock})"></button>
      </td>
    </tr>`).join('');
}

/* ── HOURS ── */
const DEFAULT_HOURS = [
    { day: 'Monday', open: '08:30', close: '20:30' },
    { day: 'Tuesday', open: '08:30', close: '20:30' },
    { day: 'Wednesday', open: '08:30', close: '20:30' },
    { day: 'Thursday', open: '08:30', close: '20:30' },
    { day: 'Friday', open: '08:30', close: '20:30' },
    { day: 'Saturday', open: '08:30', close: '20:30' },
    { day: 'Sunday', open: '08:30', close: '20:30' },
];
function renderHours(hours) {
    const grid = document.getElementById('hoursGrid');
    grid.innerHTML = hours.map((h, i) => `
    <div class="hour-row">
      <span class="hour-day">${esc(h.day)}</span>
      <input class="hour-input" type="time" id="open_${i}" value="${esc(h.open)}"/>
      <span class="hour-sep">to</span>
      <input class="hour-input" type="time" id="close_${i}" value="${esc(h.close)}"/>
      <div class="toggle-wrap" style="margin-left:auto">
        <button class="toggle ${h.closed ? '' : 'on'}" id="closed_${i}" onclick="this.classList.toggle('on')"></button>
        <span style="font-size:.74rem;color:var(--muted)">Open</span>
      </div>
    </div>`).join('');
}
document.getElementById('saveHoursBtn').addEventListener('click', async () => {
    const hours = DEFAULT_HOURS.map((h, i) => ({
        day: h.day,
        open: document.getElementById('open_' + i).value,
        close: document.getElementById('close_' + i).value,
        closed: !document.getElementById('closed_' + i).classList.contains('on'),
    }));
    try {
        await setDoc(doc(db, 'settings', 'hours'), { hours, updatedAt: serverTimestamp() });
        showToast('Store hours saved!');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
});
document.getElementById('resetHoursBtn').addEventListener('click', () => {
    renderHours(DEFAULT_HOURS); showToast('Reset to default hours');
});
document.getElementById('saveNoteBtn').addEventListener('click', async () => {
    try {
        await setDoc(doc(db, 'settings', 'storeNote'), { note: document.getElementById('specialNote').value, updatedAt: serverTimestamp() });
        showToast('Note saved!');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
});

/* ── ANNOUNCEMENTS ── */
window.closeAnnModal = function () {
    document.getElementById('annModal').classList.remove('open');
    document.getElementById('annTitle').value = '';
    document.getElementById('annBody').value = '';
};
document.getElementById('addAnnBtn').addEventListener('click', () => {
    document.getElementById('annModal').classList.add('open');
});
document.getElementById('annModal').addEventListener('click', e => {
    if (e.target === document.getElementById('annModal')) closeAnnModal();
});
document.getElementById('saveAnnBtn').addEventListener('click', async () => {
    const title = document.getElementById('annTitle').value.trim();
    const body = document.getElementById('annBody').value.trim();
    const type = document.getElementById('annType').value;
    if (!title || !body) { showToast('Please fill all fields', 'error'); return; }
    try {
        await addDoc(collection(db, 'announcements'), { title, body, type, createdAt: serverTimestamp() });
        showToast('Announcement posted!');
        closeAnnModal();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
});
window.deleteAnn = async function (id) {
    if (!confirm('Delete this announcement?')) return;
    try { await deleteDoc(doc(db, 'announcements', id)); showToast('Deleted'); }
    catch (e) { showToast('Error', 'error'); }
};
function renderAnnouncements(anns) {
    const list = document.getElementById('annList');
    if (!anns.length) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">📢</div><h4>No announcements</h4><p>Post a notice for your customers</p></div>';
        return;
    }
    list.innerHTML = anns.map(a => `
    <div class="ann-card">
      <div class="ann-dot ${a.type === 'warn' ? 'warn' : a.type === 'danger' ? 'danger' : ''}"></div>
      <div class="ann-text">
        <div class="ann-title">${esc(a.title)}</div>
        <div class="ann-body">${esc(a.body)}</div>
        <div class="ann-meta">${a.createdAt?.toDate?.()?.toLocaleDateString('en-IN') || 'Just now'}</div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="deleteAnn('${esc(a.id)}')">🗑️</button>
    </div>`).join('');
}

/* ── REVIEWS MODERATION ── */
function starRow(n) {
    n = Math.round(Number(n) || 0);
    let s = '';
    for (let i = 1; i <= 5; i++) s += (i <= n ? '★' : '☆');
    return s;
}
function productName(id) {
    const p = allProducts.find(x => x.id === id);
    return p ? p.name : 'Unknown / removed product';
}
function renderReviews() {
    const listEl = document.getElementById('reviewList');
    if (!listEl) return;
    const filter = (document.getElementById('reviewFilter') || {}).value || 'pending';
    const q = ((document.getElementById('reviewSearch') || {}).value || '').toLowerCase();

    let rows = allReviews;
    if (filter === 'pending') rows = rows.filter(r => !r.approved);
    else if (filter === 'approved') rows = rows.filter(r => r.approved);
    if (q) rows = rows.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.text || '').toLowerCase().includes(q) ||
        productName(r.productId).toLowerCase().includes(q));

    if (!rows.length) {
        listEl.innerHTML = '<div class="empty"><div class="empty-icon">⭐</div><h4>No reviews</h4><p>'
            + (filter === 'pending' ? 'Nothing waiting for approval right now.' : 'No reviews to show here.')
            + '</p></div>';
        return;
    }

    // name + text are PUBLIC, untrusted input → always escaped
    listEl.innerHTML = rows.map(r => `
    <div class="review-card${r.approved ? '' : ' pending'}">
      <div class="rc-main">
        <div class="rc-head">
          <span class="rc-stars">${starRow(r.rating)}</span>
          <span class="rc-name">${esc(r.name)}</span>
          <span class="rc-badge ${r.approved ? 'approved' : 'pending'}">${r.approved ? '✓ Approved' : '⏳ Pending'}</span>
        </div>
        <div class="rc-product">on <b>${esc(productName(r.productId))}</b></div>
        <p class="rc-text">${esc(r.text)}</p>
        <div class="rc-meta">${r.createdAt?.toDate?.()?.toLocaleString('en-IN') || 'Just now'}</div>
      </div>
      <div class="rc-actions">
        ${r.approved
            ? `<button class="btn btn-outline btn-sm" onclick="unapproveReview('${esc(r.id)}')">🙈 Hide</button>`
            : `<button class="btn btn-green btn-sm" onclick="approveReview('${esc(r.id)}')">✓ Approve</button>`}
        <button class="btn btn-danger btn-sm" onclick="deleteReview('${esc(r.id)}')">🗑️</button>
      </div>
    </div>`).join('');
}

window.approveReview = async function (id) {
    try { await updateDoc(doc(db, 'reviews', id), { approved: true }); showToast('Review approved — now live on the site'); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
};
window.unapproveReview = async function (id) {
    try { await updateDoc(doc(db, 'reviews', id), { approved: false }); showToast('Review hidden from the site'); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
};
window.deleteReview = async function (id) {
    if (!confirm('Delete this review permanently? This cannot be undone.')) return;
    try { await deleteDoc(doc(db, 'reviews', id)); showToast('Review deleted'); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
};

document.getElementById('reviewFilter').addEventListener('change', renderReviews);
document.getElementById('reviewSearch').addEventListener('input', renderReviews);

/* ── SETTINGS ── */
document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    try {
        await setDoc(doc(db, 'settings', 'store'), {
            name: document.getElementById('storeName').value,
            phone: document.getElementById('storePhone').value,
            address: document.getElementById('storeAddress').value,
            updatedAt: serverTimestamp()
        });
        showToast('Settings saved!');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
});
document.getElementById('clearCacheBtn').addEventListener('click', () => {
    try {
        ['mm-products-cache', 'mm-ann-cache', 'mm-hours-cache'].forEach(k => localStorage.removeItem(k));
        localStorage.setItem('mm-cache-version', Date.now().toString());
        showToast('Cache cleared! Customers will see fresh data.');
    } catch (e) { showToast('Done'); }
});

/* ── SEARCH + FILTER ── */
let allProducts = [];
let allReviews = [];
function filterProducts() {
    const q = document.getElementById('productSearch').value.toLowerCase();
    const cat = document.getElementById('catFilter').value;
    return allProducts.filter(p =>
        (!q || p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q)) &&
        (!cat || p.cat === cat)
    );
}
function filterStock() {
    const q = document.getElementById('stockSearch').value.toLowerCase();
    const f = document.getElementById('stockFilter').value;
    return allProducts.filter(p =>
        (!q || p.name.toLowerCase().includes(q)) &&
        (f === '' || (f === 'in' ? p.inStock : !p.inStock))
    );
}
document.getElementById('productSearch').addEventListener('input', () => renderProductsTable(filterProducts(), 'productsBody'));
document.getElementById('catFilter').addEventListener('change', () => renderProductsTable(filterProducts(), 'productsBody'));
document.getElementById('stockSearch').addEventListener('input', () => renderStockTable(filterStock()));
document.getElementById('stockFilter').addEventListener('change', () => renderStockTable(filterStock()));

/* ── INIT APP ── */
function initApp() {
    // live products listener
    const pQuery = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    onSnapshot(pQuery, snap => {
        allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // update counts
        const inStock = allProducts.filter(p => p.inStock).length;
        document.getElementById('productCount').textContent = allProducts.length;
        document.getElementById('dash-total').textContent = allProducts.length;
        document.getElementById('dash-instock').textContent = inStock;
        document.getElementById('dash-outstock').textContent = allProducts.length - inStock;
        // render tables
        renderProductsTable(allProducts.slice(0, 5), 'recentBody', false);
        renderProductsTable(filterProducts(), 'productsBody');
        renderStockTable(filterStock());
        if (allReviews.length) renderReviews();
    });

    // live announcements listener
    const aQuery = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    onSnapshot(aQuery, snap => {
        const anns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        document.getElementById('dash-ann').textContent = anns.length;
        renderAnnouncements(anns);
    });

    // live reviews listener (owner can read all, incl. pending)
    const rQuery = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    onSnapshot(rQuery, snap => {
        allReviews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pending = allReviews.filter(r => !r.approved).length;
        const badge = document.getElementById('reviewPendingBadge');
        if (badge) { badge.textContent = pending; badge.style.display = pending ? '' : 'none'; }
        const dash = document.getElementById('dash-reviews');
        if (dash) dash.textContent = pending;
        renderReviews();
    }, err => { console.warn('reviews listener error', err); });

    // load hours
    getDoc(doc(db, 'settings', 'hours')).then(d => {
        renderHours(d.exists() ? d.data().hours : DEFAULT_HOURS);
    });

    // load store note
    getDoc(doc(db, 'settings', 'storeNote')).then(d => {
        if (d.exists()) document.getElementById('specialNote').value = d.data().note || '';
    });

    // load settings
    getDoc(doc(db, 'settings', 'store')).then(d => {
        if (d.exists()) {
            document.getElementById('storeName').value = d.data().name || '';
            document.getElementById('storePhone').value = d.data().phone || '';
            document.getElementById('storeAddress').value = d.data().address || '';
        }
    });
}