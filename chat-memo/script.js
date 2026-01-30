// ▼▼▼ あなたの設定データ（組み込み済み） ▼▼▼
const firebaseConfig = {
  apiKey: "AIzaSyABw5Wm_zA8rJ9d-KPZhI4NrxeqjQsJQkY",
  authDomain: "chat-memo-8b4f0.firebaseapp.com",
  projectId: "chat-memo-8b4f0",
  storageBucket: "chat-memo-8b4f0.firebasestorage.app",
  messagingSenderId: "110934071534",
  appId: "1:110934071534:web:357b02e404c369abf3bbff"
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// Firebase初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==========================================
// タブ設定
// ==========================================
const TABS = [
    { id: 'todo',    name: 'やること',  color: '#ff6b6b' },
    { id: 'buy',     name: '買い物',    color: '#339af0' },
    { id: 'idea',    name: 'アイデア',  color: '#fcc419' },
    { id: 'private', name: 'プライベート', color: '#51cf66' }
];

let currentTabId = TABS[0].id;
let unsubscribe = null;
let replyingTo = null;
let deleteTargetId = null; 

// DOM要素の取得
const messageArea = document.getElementById('message-area');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const imageBtn = document.getElementById('image-btn');
const imageInput = document.getElementById('image-input');
const tabContainer = document.getElementById('tab-container');
const replyPreview = document.getElementById('reply-preview');
const replyTargetText = document.getElementById('reply-target-text');
const loadingOverlay = document.getElementById('loading-overlay');
const deleteModal = document.getElementById('delete-modal');

// 読み込み完了時に実行
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    switchTab(currentTabId);
    initSwipeGestures(); // ★ジェスチャー機能の初期化
});

// ------------------------------------------------
// タブ機能
// ------------------------------------------------
function initTabs() {
    if(!tabContainer) return;
    tabContainer.innerHTML = '';
    TABS.forEach(tab => {
        const btn = document.createElement('div');
        btn.classList.add('tab-item');
        btn.textContent = tab.name;
        btn.onclick = () => switchTab(tab.id);
        btn.id = `tab-btn-${tab.id}`;
        tabContainer.appendChild(btn);
    });
}

function switchTab(tabId) {
    currentTabId = tabId;
    const tabConfig = TABS.find(t => t.id === tabId);

    // タブの選択状態更新
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-btn-${tabId}`);
    if(activeBtn) activeBtn.classList.add('active');

    // 背景色の更新（10%の薄さ）
    document.documentElement.style.setProperty('--theme-color', tabConfig.color);
    const bg = hexToRgba(tabConfig.color, 0.1); 
    document.documentElement.style.setProperty('--theme-bg', bg);

    // データ読み込み
    loadMessagesForTab(tabId);
}

// ------------------------------------------------
// データ取得
// ------------------------------------------------
function loadMessagesForTab(tabId) {
    if (unsubscribe) unsubscribe();
    messageArea.innerHTML = "";

    unsubscribe = db.collection("memos")
        .where("tab", "==", tabId)
        .orderBy("createdAt", "asc")
        .onSnapshot((snapshot) => {
            messageArea.innerHTML = ""; 
            snapshot.forEach((doc) => {
                renderMessage(doc.id, doc.data());
            });
            scrollToBottom();
        }, (error) => {
            console.error("データ読み込みエラー:", error);
        });
}

function scrollToBottom() {
    setTimeout(() => {
        if (document.body.scrollHeight > window.innerHeight) {
            window.scrollTo(0, document.body.scrollHeight);
        }
    }, 50);
}

// ------------------------------------------------
// 送信処理（画像圧縮・Base64版）
// ------------------------------------------------
if(sendBtn){
    sendBtn.addEventListener('click', () => handleSend());
}
if(textInput){
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });
}

if(imageBtn && imageInput) {
    imageBtn.addEventListener('click', () => {
        imageInput.click();
    });
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleSend(file);
    });
}

async function handleSend(file = null) {
    const text = textInput.value;
    if (text === '' && !file) return;

    if(loadingOverlay) loadingOverlay.style.display = 'flex';

    try {
        let imageData = null;
        if (file) {
            imageData = await compressImage(file);
        }

        await db.collection("memos").add({
            text: text,
            imageUrl: imageData,
            tab: currentTabId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isDone: false,
            replyTo: replyingTo ? replyingTo : null
        });

        textInput.value = '';
        if(imageInput) imageInput.value = ''; 
        cancelReply();
        
        scrollToBottom();

    } catch (error) {
        console.error("送信エラー:", error);
        alert("送信に失敗しました。\n" + error.message);
    } finally {
        if(loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

function compressImage(file) {
    return new Promise((resolve, reject) => {
        const maxWidth = 800;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// ------------------------------------------------
// 表示処理
// ------------------------------------------------
function renderMessage(id, data) {
    const card = document.createElement('div');
    card.classList.add('message-card');
    if (data.isDone) card.classList.add('done');

    let quoteHtml = '';
    if (data.replyTo) {
        const replyContent = data.replyTo.text ? data.replyTo.text : '(画像)';
        quoteHtml = `<div class="quote-block">Re: ${escapeHtml(replyContent)}</div>`;
    }

    const date = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '...';
    const linkedText = autoLink(escapeHtml(data.text || ''));
    
    const imageHtml = data.imageUrl 
        ? `<img src="${data.imageUrl}" class="message-image" onload="scrollToBottom()">` 
        : '';

    card.innerHTML = `
        ${quoteHtml}
        <div class="message-header">
            <span>${date}</span>
            <div class="actions">
                <button class="action-btn" onclick="toggleDone('${id}', ${!data.isDone})">
                    <span class="material-icons">${data.isDone ? 'check_box' : 'check_box_outline_blank'}</span>
                </button>
                <button class="action-btn" onclick="setReply('${escapeHtml(data.text || '')}')">
                    <span class="material-icons">reply</span>
                </button>
                <button class="action-btn" onclick="deleteMessage('${id}')" style="color:#ff6b6b;">
                    <span class="material-icons">delete</span>
                </button>
            </div>
        </div>
        <div class="message-text">${linkedText}</div>
        ${imageHtml}
    `;

    messageArea.appendChild(card);
}

// ------------------------------------------------
// ユーティリティ
// ------------------------------------------------
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function autoLink(text) {
    const regex = /(https?:\/\/[^\s]+)/g;
    return text.replace(regex, '<a href="$1" target="_blank">$1</a>');
}

function escapeHtml(str) {
    if(!str) return "";
    return str.replace(/[&<>"']/g, match => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[match]));
}

window.toggleDone = function(id, status) {
    db.collection("memos").doc(id).update({ isDone: status });
}
window.setReply = function(text) {
    replyingTo = { text: text };
    if(replyTargetText) replyTargetText.textContent = `返信: ${text.substring(0, 15)}...`;
    if(replyPreview) replyPreview.style.display = 'flex';
    if(textInput) textInput.focus();
}
window.cancelReply = function() {
    replyingTo = null;
    if(replyPreview) replyPreview.style.display = 'none';
}
window.deleteMessage = function(id) {
    deleteTargetId = id;
    if(deleteModal) {
        deleteModal.style.display = 'flex';
    }
}
window.confirmDelete = function() {
    if (deleteTargetId) {
        db.collection("memos").doc(deleteTargetId).delete();
    }
    closeDeleteModal();
}
window.closeDeleteModal = function() {
    deleteTargetId = null;
    if(deleteModal) {
        deleteModal.style.display = 'none';
    }
}

// ==========================================
// ★追加: スワイプ・ドラッグでのタブ切り替え
// ==========================================
function initSwipeGestures() {
    let startX = 0;
    let startY = 0;
    let isDragging = false;

    // --- スマホ・タッチ操作 (スワイプ) ---
    document.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const diffX = endX - startX;
        const diffY = endY - startY;

        // 横方向の移動が大きく、縦方向の移動が小さい場合のみ反応 (スクロール阻害防止)
        if (Math.abs(diffX) > 60 && Math.abs(diffY) < 100) {
            if (diffX > 0) goPrevTab();
            else goNextTab();
        }
    });

    // --- PC・マウス操作 (背景ドラッグ) ---
    document.addEventListener('mousedown', (e) => {
        // メモカード、入力欄、ヘッダー、モーダル内でのクリックは無視（テキスト選択などを優先）
        if (e.target.closest('.message-card') || 
            e.target.closest('.input-area') || 
            e.target.closest('.header') ||
            e.target.closest('.modal-box')) {
            return;
        }

        // 背景をつかんだと判定
        isDragging = true;
        startX = e.clientX;
        document.body.style.cursor = 'grabbing'; // カーソルを変更
        e.preventDefault(); // テキスト選択などを防止
    });

    document.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = ''; // カーソルを戻す

        const endX = e.clientX;
        const diffX = endX - startX;

        // 50px以上動かしたら切り替え
        if (Math.abs(diffX) > 50) {
            if (diffX > 0) goPrevTab();
            else goNextTab();
        }
    });

    document.addEventListener('mouseleave', () => {
        if(isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
        }
    });
}

// タブ移動のロジック
function goNextTab() {
    const currentIndex = TABS.findIndex(t => t.id === currentTabId);
    const nextIndex = (currentIndex + 1) % TABS.length;
    switchTab(TABS[nextIndex].id);
}

function goPrevTab() {
    const currentIndex = TABS.findIndex(t => t.id === currentTabId);
    const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    switchTab(TABS[prevIndex].id);
}