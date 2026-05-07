const firebaseConfig = {
  apiKey: "AIzaSyABw5Wm_zA8rJ9d-KPZhI4NrxeqjQsJQkY",
  authDomain: "chat-memo-8b4f0.firebaseapp.com",
  projectId: "chat-memo-8b4f0",
  storageBucket: "chat-memo-8b4f0.firebasestorage.app",
  messagingSenderId: "110934071534",
  appId: "1:110934071534:web:357b02e404c369abf3bbff"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const TABS = [
    { id: 'todo',    name: 'やること',     color: '#ff6b6b' },
    { id: 'buy',     name: '買い物',       color: '#339af0' },
    { id: 'idea',    name: 'アイデア',     color: '#fcc419' },
    { id: 'private', name: 'プライベート', color: '#51cf66' }
];

const savedTabId = localStorage.getItem('currentTabId');
let currentTabId = TABS.some(t => t.id === savedTabId) ? savedTabId : TABS[0].id;
let unsubscribe = null;
let replyingTo = null;
let deleteTargetId = null;
let isSortMode = false;
let showDone = true;
let allDocs = [];
let dragSrcId = null;

const messageArea   = document.getElementById('message-area');
const textInput     = document.getElementById('text-input');
const sendBtn       = document.getElementById('send-btn');
const imageBtn      = document.getElementById('image-btn');
const imageInput    = document.getElementById('image-input');
const tabContainer  = document.getElementById('tab-container');
const loadingOverlay = document.getElementById('loading-overlay');

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    switchTab(currentTabId);
    initSwipeGestures();
});

// ==================== TABS ====================
function initTabs() {
    if (!tabContainer) return;
    tabContainer.innerHTML = '';

    TABS.forEach(tab => {
        const btn = document.createElement('div');
        btn.classList.add('tab-item');
        btn.textContent = tab.name;
        btn.id = `tab-btn-${tab.id}`;
        btn.onclick = () => switchTab(tab.id);

        // Drop zone for moving cards between tabs in sort mode
        btn.addEventListener('dragover', e => {
            if (!isSortMode) return;
            e.preventDefault();
            btn.classList.add('drag-over');
        });
        btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
        btn.addEventListener('drop', e => {
            e.preventDefault();
            btn.classList.remove('drag-over');
            if (!isSortMode || !dragSrcId) return;
            const src = allDocs.find(d => d.id === dragSrcId);
            if (!src) return;
            if (src.parentId) { showToast('タブ間の移動は親カードのみ可能です'); return; }
            if (tab.id !== currentTabId) moveCardToTab(dragSrcId, tab.id);
        });

        tabContainer.appendChild(btn);
    });

    // Action row
    const actionRow = document.createElement('div');
    actionRow.className = 'action-row';
    actionRow.innerHTML = `
        <button id="sort-btn" class="action-row-btn" onclick="toggleSortMode()">
            <span class="material-icons">swap_vert</span><span>並び替え</span>
        </button>
        <button id="show-done-btn" class="action-row-btn" onclick="toggleShowDone()">
            <span class="material-icons">visibility</span><span>チェック済み</span>
        </button>
    `;
    document.querySelector('.header').appendChild(actionRow);

    requestAnimationFrame(() => {
        const h = document.querySelector('.header').offsetHeight;
        document.body.style.paddingTop = h + 'px';
    });
}

function switchTab(tabId) {
    if (isSortMode) toggleSortMode();
    currentTabId = tabId;
    localStorage.setItem('currentTabId', tabId);
    const tab = TABS.find(t => t.id === tabId);
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-btn-${tabId}`)?.classList.add('active');
    document.documentElement.style.setProperty('--theme-color', tab.color);
    document.documentElement.style.setProperty('--theme-bg', hexToRgba(tab.color, 0.1));
    loadMessagesForTab(tabId);
}

// ==================== DATA ====================
function loadMessagesForTab(tabId) {
    if (unsubscribe) unsubscribe();
    messageArea.innerHTML = '';
    allDocs = [];

    unsubscribe = db.collection('memos')
        .where('tab', '==', tabId)
        .orderBy('createdAt', 'asc')
        .onSnapshot(snapshot => {
            allDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort in memory by order field (falls back to timestamp for legacy data)
            allDocs.sort((a, b) => (a.order ?? getMs(a)) - (b.order ?? getMs(b)));
            renderAllCards();
        }, err => console.error('データ読み込みエラー:', err));
}

function getMs(doc) {
    return doc.createdAt?.toMillis?.() ?? 0;
}

// ==================== RENDER ====================
function renderAllCards() {
    messageArea.innerHTML = '';

    // Build tree
    const childrenMap = {};
    const roots = [];
    allDocs.forEach(doc => {
        if (!childrenMap[doc.id]) childrenMap[doc.id] = [];
        const parentExists = doc.parentId && allDocs.find(d => d.id === doc.parentId);
        if (parentExists) {
            if (!childrenMap[doc.parentId]) childrenMap[doc.parentId] = [];
            childrenMap[doc.parentId].push(doc);
        } else {
            roots.push(doc);
        }
    });

    const byOrder = arr => [...arr].sort((a, b) => (a.order ?? getMs(a)) - (b.order ?? getMs(b)));

    function flattenTree(node, depth) {
        const rows = [{ ...node, _depth: depth }];
        byOrder(childrenMap[node.id] || []).forEach(child => rows.push(...flattenTree(child, depth + 1)));
        return rows;
    }

    const flat = [];
    byOrder(roots).forEach(root => flat.push(...flattenTree(root, 0)));

    flat.forEach(item => {
        if (!showDone && item.isDone) return;
        renderCard(item.id, item, item._depth);
    });

    scrollToBottom();
}

function renderCard(id, data, depth) {
    const card = document.createElement('div');
    card.classList.add('message-card');
    card.dataset.id = id;
    card.dataset.depth = depth;

    if (depth > 0) {
        card.style.marginLeft = (depth * 22) + 'px';
        card.classList.add(`depth-${depth}`);
    }
    if (data.isDone) card.classList.add('done');

    if (isSortMode) {
        card.setAttribute('draggable', 'true');
        card.classList.add('sortable');
        card.addEventListener('dragstart', onDragStart);
        card.addEventListener('dragover', onDragOver);
        card.addEventListener('drop', onDrop);
        card.addEventListener('dragend', onDragEnd);
    }

    const date = data.createdAt
        ? new Date(data.createdAt.toDate()).toLocaleString('ja-JP', {
              month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })
        : '...';

    const linkedText = autoLink(escapeHtml(data.text || ''));
    const imageHtml  = data.imageUrl ? `<img src="${data.imageUrl}" class="message-image">` : '';
    const quoteHtml  = data.replyTo?.text
        ? `<div class="quote-block">Re: ${escapeHtml(data.replyTo.text)}</div>`
        : '';

    let actionsHtml = '';
    if (isSortMode) {
        actionsHtml = `<span class="material-icons drag-handle">drag_indicator</span>`;
    } else {
        const checkIcon  = data.isDone ? 'check_box' : 'check_box_outline_blank';
        const canAddChild = depth < 2;
        actionsHtml = `
            <button class="action-btn" onclick="toggleDone('${id}', ${!data.isDone})">
                <span class="material-icons">${checkIcon}</span>
            </button>
            <button class="action-btn" onclick="startEdit('${id}')" title="編集">
                <span class="material-icons">edit</span>
            </button>
            ${canAddChild ? `
            <button class="action-btn" onclick="addChildCard('${id}')" title="子カードを追加">
                <span class="material-icons">add_circle_outline</span>
            </button>
            <button class="action-btn" onclick="showLinkChildModal('${id}')" title="既存カードを子にする">
                <span class="material-icons">link</span>
            </button>` : ''}
            ${depth > 0 ? `
            <button class="action-btn" onclick="unlinkCard('${id}')" title="親子関係を解消">
                <span class="material-icons">link_off</span>
            </button>` : ''}
            <button class="action-btn delete-btn" onclick="deleteMessage('${id}')">
                <span class="material-icons">delete</span>
            </button>
        `;
    }

    card.innerHTML = `
        ${quoteHtml}
        <div class="message-header">
            <span class="msg-date">${date}</span>
            <div class="actions">${actionsHtml}</div>
        </div>
        <div class="message-text" id="text-${id}">${linkedText}</div>
        ${imageHtml}
    `;

    messageArea.appendChild(card);
}

// ==================== EDIT ====================
window.startEdit = function(id) {
    const textEl = document.getElementById(`text-${id}`);
    if (!textEl || textEl.querySelector('textarea')) return;
    const doc = allDocs.find(d => d.id === id);
    const current = doc?.text || '';

    textEl.innerHTML = '';

    const ta = document.createElement('textarea');
    ta.className = 'edit-textarea';
    ta.id = `edit-ta-${id}`;
    ta.value = current;
    // Enter = newline in textarea by default (no override needed)

    const row = document.createElement('div');
    row.className = 'edit-actions';
    row.innerHTML = `
        <button class="edit-save-btn" onclick="saveEdit('${id}')">保存</button>
        <button class="edit-cancel-btn" onclick="cancelEdit('${id}')">キャンセル</button>
    `;

    textEl.appendChild(ta);
    textEl.appendChild(row);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
};

window.saveEdit = function(id) {
    const ta = document.getElementById(`edit-ta-${id}`);
    if (!ta) return;
    db.collection('memos').doc(id).update({ text: ta.value })
        .catch(err => console.error('Edit error:', err));
};

window.cancelEdit = function(id) {
    const textEl = document.getElementById(`text-${id}`);
    const doc = allDocs.find(d => d.id === id);
    if (!textEl || !doc) return;
    textEl.innerHTML = autoLink(escapeHtml(doc.text || ''));
};

// ==================== SORT MODE ====================
window.toggleSortMode = function() {
    isSortMode = !isSortMode;
    const btn = document.getElementById('sort-btn');
    if (btn) {
        btn.classList.toggle('active', isSortMode);
        btn.innerHTML = isSortMode
            ? '<span class="material-icons">check</span><span>完了</span>'
            : '<span class="material-icons">swap_vert</span><span>並び替え</span>';
    }
    // Highlight tabs as drop targets
    document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('sort-drop-zone', isSortMode));
    renderAllCards();
};

// ==================== DRAG & DROP ====================
function onDragStart(e) {
    dragSrcId = e.currentTarget.dataset.id;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcId);
}

function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.currentTarget;
    if (card.dataset.id === dragSrcId) return;
    document.querySelectorAll('.card-drop-above, .card-drop-below').forEach(el =>
        el.classList.remove('card-drop-above', 'card-drop-below'));
    const mid = card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2;
    card.classList.add(e.clientY < mid ? 'card-drop-above' : 'card-drop-below');
}

function onDrop(e) {
    e.preventDefault();
    const targetCard = e.currentTarget;
    const targetId   = targetCard.dataset.id;
    const isAbove    = targetCard.classList.contains('card-drop-above');
    document.querySelectorAll('.card-drop-above, .card-drop-below').forEach(el =>
        el.classList.remove('card-drop-above', 'card-drop-below'));
    if (!dragSrcId || dragSrcId === targetId) return;
    if (getSelfAndDescendants(dragSrcId).includes(targetId)) return;
    reorderCards(dragSrcId, targetId, isAbove);
}

function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.card-drop-above, .card-drop-below').forEach(el =>
        el.classList.remove('card-drop-above', 'card-drop-below'));
    dragSrcId = null;
}

function getFlatOrder() {
    const childrenMap = {};
    const roots = [];
    allDocs.forEach(doc => {
        if (!childrenMap[doc.id]) childrenMap[doc.id] = [];
        const hasParent = doc.parentId && allDocs.find(d => d.id === doc.parentId);
        if (hasParent) {
            if (!childrenMap[doc.parentId]) childrenMap[doc.parentId] = [];
            childrenMap[doc.parentId].push(doc);
        } else {
            roots.push(doc);
        }
    });
    const byOrder = arr => [...arr].sort((a, b) => (a.order ?? getMs(a)) - (b.order ?? getMs(b)));
    function flatten(node) {
        return [node, ...byOrder(childrenMap[node.id] || []).flatMap(flatten)];
    }
    return byOrder(roots).flatMap(flatten);
}

function getSelfAndDescendants(id) {
    const result = [id];
    allDocs.filter(d => d.parentId === id).forEach(c => result.push(...getSelfAndDescendants(c.id)));
    return result;
}

function reorderCards(srcId, targetId, dropAbove) {
    const flat      = getFlatOrder();
    const srcIds    = getSelfAndDescendants(srcId);
    const srcGroup  = flat.filter(d => srcIds.includes(d.id));
    const withoutSrc = flat.filter(d => !srcIds.includes(d.id));

    let insertIdx = withoutSrc.findIndex(d => d.id === targetId);
    if (insertIdx === -1) return;
    if (!dropAbove) insertIdx++;

    const newOrder = [...withoutSrc];
    newOrder.splice(insertIdx, 0, ...srcGroup);

    const batch = db.batch();
    newOrder.forEach((doc, i) => {
        batch.update(db.collection('memos').doc(doc.id), { order: i * 10 });
    });
    batch.commit().catch(err => console.error('Reorder error:', err));
}

async function moveCardToTab(cardId, newTabId) {
    const descendants = getSelfAndDescendants(cardId);
    let maxOrder = 0;
    try {
        const snap = await db.collection('memos').where('tab', '==', newTabId).orderBy('createdAt', 'asc').get();
        maxOrder = snap.size * 10 + 10;
    } catch (e) { /* ignore */ }

    const batch = db.batch();
    descendants.forEach((id, i) => {
        batch.update(db.collection('memos').doc(id), { tab: newTabId, order: maxOrder + i * 10 });
    });
    await batch.commit();
    showToast(`${TABS.find(t => t.id === newTabId)?.name}に移動しました`);
}

// ==================== PARENT-CHILD ====================
window.addChildCard = function(parentId) {
    const parentDepth = getDepth(parentId);
    if (parentDepth >= 2) { showToast('階層は3段階までです'); return; }

    const text = prompt('子カードのテキストを入力:');
    if (text === null || text.trim() === '') return;

    const parent   = allDocs.find(d => d.id === parentId);
    const siblings = allDocs.filter(d => d.parentId === parentId);
    const baseOrder = parent?.order ?? 0;
    const maxSibOrder = siblings.length > 0
        ? Math.max(...siblings.map(d => d.order ?? 0))
        : baseOrder;

    db.collection('memos').add({
        text: text.trim(),
        imageUrl: null,
        tab: currentTabId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isDone: false,
        replyTo: null,
        order: maxSibOrder + 5,
        parentId: parentId,
        depth: parentDepth + 1
    }).catch(err => console.error('Add child error:', err));
};

window.showLinkChildModal = function(parentId) {
    const parentDepth = getDepth(parentId);
    if (parentDepth >= 2) { showToast('階層は3段階までです'); return; }

    const excluded   = new Set(getSelfAndDescendants(parentId));
    const candidates = allDocs.filter(d => !excluded.has(d.id) && !d.parentId);

    if (candidates.length === 0) { showToast('子カードにできるカードがありません'); return; }

    document.getElementById('link-child-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'link-child-modal';
    modal.className = 'modal-overlay';

    const listHtml = candidates.map(c => {
        const preview = (c.text || '(画像)').substring(0, 40);
        const ellipsis = (c.text || '').length > 40 ? '…' : '';
        return `<div class="link-candidate" onclick="linkChildCard('${parentId}', '${c.id}')">
            ${escapeHtml(preview)}${ellipsis}
        </div>`;
    }).join('');

    modal.innerHTML = `
        <div class="modal-box">
            <p class="modal-text">子カードにするカードを選択</p>
            <div class="link-list">${listHtml}</div>
            <div class="modal-actions">
                <button class="modal-btn cancel"
                    onclick="document.getElementById('link-child-modal').remove()">キャンセル</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.linkChildCard = function(parentId, childId) {
    const parentDepth = getDepth(parentId);
    const batch = db.batch();
    batch.update(db.collection('memos').doc(childId), { parentId: parentId, depth: parentDepth + 1 });
    allDocs.filter(d => d.parentId === childId).forEach(gc => {
        batch.update(db.collection('memos').doc(gc.id), { depth: parentDepth + 2 });
    });
    batch.commit()
        .then(() => document.getElementById('link-child-modal')?.remove())
        .catch(err => console.error('Link error:', err));
};

window.unlinkCard = function(id) {
    const batch = db.batch();
    batch.update(db.collection('memos').doc(id), { parentId: null, depth: 0 });
    allDocs.filter(d => d.parentId === id).forEach(child => {
        batch.update(db.collection('memos').doc(child.id), { depth: 1 });
    });
    batch.commit().catch(err => console.error('Unlink error:', err));
};

function getDepth(id) {
    const doc = allDocs.find(d => d.id === id);
    if (!doc || !doc.parentId) return 0;
    return 1 + getDepth(doc.parentId);
}

// ==================== DONE TOGGLE ====================
window.toggleDone = function(id, status) {
    const batch = db.batch();
    batch.update(db.collection('memos').doc(id), { isDone: status });

    if (status) {
        // Check all descendants
        getSelfAndDescendants(id).slice(1).forEach(descId => {
            batch.update(db.collection('memos').doc(descId), { isDone: true });
        });
    } else {
        // Uncheck all ancestors
        let cur = allDocs.find(d => d.id === id);
        while (cur?.parentId) {
            batch.update(db.collection('memos').doc(cur.parentId), { isDone: false });
            cur = allDocs.find(d => d.id === cur.parentId);
        }
    }

    batch.commit().then(() => {
        if (status) {
            const doc = allDocs.find(d => d.id === id);
            if (doc?.parentId) setTimeout(() => autoCheckParent(doc.parentId), 600);
        }
    });
};

function autoCheckParent(parentId) {
    const children = allDocs.filter(d => d.parentId === parentId);
    if (children.length > 0 && children.every(c => c.isDone)) {
        db.collection('memos').doc(parentId).update({ isDone: true }).then(() => {
            const parent = allDocs.find(d => d.id === parentId);
            if (parent?.parentId) setTimeout(() => autoCheckParent(parent.parentId), 600);
        });
    }
}

// ==================== DELETE ====================
window.deleteMessage = function(id) {
    deleteTargetId = id;
    document.getElementById('delete-modal').style.display = 'flex';
};

window.confirmDelete = function() {
    if (!deleteTargetId) return;
    const batch = db.batch();
    getSelfAndDescendants(deleteTargetId).forEach(id => batch.delete(db.collection('memos').doc(id)));
    batch.commit();
    closeDeleteModal();
};

window.closeDeleteModal = function() {
    deleteTargetId = null;
    document.getElementById('delete-modal').style.display = 'none';
};

// ==================== SHOW/HIDE DONE ====================
window.toggleShowDone = function() {
    showDone = !showDone;
    const btn = document.getElementById('show-done-btn');
    if (btn) {
        btn.classList.toggle('active', !showDone);
        btn.innerHTML = showDone
            ? '<span class="material-icons">visibility</span><span>チェック済み</span>'
            : '<span class="material-icons">visibility_off</span><span>チェック済み</span>';
    }
    renderAllCards();
};

// ==================== SEND ====================
if (sendBtn) sendBtn.addEventListener('click', () => handleSend());
if (textInput) textInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSend(); });
if (imageBtn && imageInput) {
    imageBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', e => { if (e.target.files[0]) handleSend(e.target.files[0]); });
}

async function handleSend(file = null) {
    const text = textInput.value.trim();
    if (!text && !file) return;
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    try {
        let imageData = null;
        if (file) imageData = await compressImage(file);
        const rootDocs  = allDocs.filter(d => !d.parentId);
        const maxOrder  = rootDocs.length > 0 ? Math.max(...rootDocs.map(d => d.order ?? 0)) + 10 : 10;
        await db.collection('memos').add({
            text: text,
            imageUrl: imageData,
            tab: currentTabId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isDone: false,
            replyTo: replyingTo ?? null,
            order: maxOrder,
            parentId: null,
            depth: 0
        });
        textInput.value = '';
        if (imageInput) imageInput.value = '';
        cancelReply();
        scrollToBottom();
    } catch (err) {
        console.error('送信エラー:', err);
        alert('送信に失敗しました。\n' + err.message);
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

// ==================== REPLY ====================
window.setReply = function(text) {
    replyingTo = { text };
    const el      = document.getElementById('reply-target-text');
    const preview = document.getElementById('reply-preview');
    if (el) el.textContent = `返信: ${text.substring(0, 15)}...`;
    if (preview) preview.style.display = 'flex';
    if (textInput) textInput.focus();
};
window.cancelReply = function() {
    replyingTo = null;
    const preview = document.getElementById('reply-preview');
    if (preview) preview.style.display = 'none';
};

// ==================== TOAST ====================
function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}

// ==================== UTILS ====================
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = e => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const maxW = 800;
                let w = img.width, h = img.height;
                if (w > maxW) { h = h * maxW / w; w = maxW; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

function scrollToBottom() {
    setTimeout(() => { window.scrollTo(0, document.body.scrollHeight); }, 50);
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function autoLink(text) {
    return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

// ==================== SWIPE GESTURES ====================
function initSwipeGestures() {
    let startX = 0, startY = 0, mouseDragging = false;

    document.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 100) { dx > 0 ? goPrevTab() : goNextTab(); }
    });

    document.addEventListener('mousedown', e => {
        if (e.target.closest('.message-card,.input-area,.header,.modal-box,.toast')) return;
        mouseDragging = true;
        startX = e.clientX;
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mouseup', e => {
        if (!mouseDragging) return;
        mouseDragging = false;
        document.body.style.cursor = '';
        if (Math.abs(e.clientX - startX) > 50) { e.clientX > startX ? goPrevTab() : goNextTab(); }
    });

    document.addEventListener('mouseleave', () => {
        if (mouseDragging) { mouseDragging = false; document.body.style.cursor = ''; }
    });
}

function goNextTab() {
    const i = TABS.findIndex(t => t.id === currentTabId);
    switchTab(TABS[(i + 1) % TABS.length].id);
}
function goPrevTab() {
    const i = TABS.findIndex(t => t.id === currentTabId);
    switchTab(TABS[(i - 1 + TABS.length) % TABS.length].id);
}
