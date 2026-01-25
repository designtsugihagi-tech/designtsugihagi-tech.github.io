// ▼▼▼ 前回のあなたのfirebaseConfigをここに貼ってください ▼▼▼
const firebaseConfig = {
    // ... 前回の内容をコピペ ...
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==========================================
// ★ ここでタブの名前と色を設定できます ★
// 色は16進数（#RRGGBB）で指定してください
// ==========================================
const TABS = [
    { id: 'todo',    name: 'やること',  color: '#ff6b6b' }, // 赤
    { id: 'buy',     name: '買い物',    color: '#339af0' }, // 青
    { id: 'idea',    name: 'アイデア',  color: '#fcc419' }, // 黄
    { id: 'private', name: 'プライベート', color: '#51cf66' }  // 緑
];

// 初期設定
let currentTabId = TABS[0].id; // 最初のタブを選択
let unsubscribe = null; // リアルタイム同期の管理用

const messageArea = document.getElementById('message-area');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const tabContainer = document.getElementById('tab-container');
const replyPreview = document.getElementById('reply-preview');
const replyTargetText = document.getElementById('reply-target-text');

let replyingTo = null;

// アプリ起動時の処理
initTabs();
switchTab(currentTabId);

// ------------------------------------------------
// タブ生成と切り替え機能
// ------------------------------------------------
function initTabs() {
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

    // 1. タブの見た目を更新
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-btn-${tabId}`).classList.add('active');

    // 2. テーマカラー（CSS変数）を更新
    // 100%の色
    document.documentElement.style.setProperty('--theme-color', tabConfig.color);
    // 20%の色（背景用）を作る関数呼び出し
    const bg = hexToRgba(tabConfig.color, 0.2); 
    document.documentElement.style.setProperty('--theme-bg', bg);

    // 3. Firestoreの監視を切り替え
    loadMessagesForTab(tabId);
}

// ------------------------------------------------
// Firestore データ処理
// ------------------------------------------------
function loadMessagesForTab(tabId) {
    // 前のタブの監視をストップ
    if (unsubscribe) {
        unsubscribe();
    }

    messageArea.innerHTML = ""; // 画面クリア

    // 選択されたタブIDを持つデータだけを取得
    unsubscribe = db.collection("memos")
        .where("tab", "==", tabId) // ★ここがポイント：タブでフィルタリング
        .orderBy("createdAt", "asc")
        .onSnapshot((snapshot) => {
            // 変更があったデータだけ処理するのではなく、シンプルに全描画（並び順維持のため）
            // ※データ量が増えると遅くなるので、本当は差分更新が良いですが簡易実装です
            messageArea.innerHTML = ""; 
            snapshot.forEach((doc) => {
                renderMessage(doc.id, doc.data());
            });
            window.scrollTo(0, document.body.scrollHeight);
        });
}

function sendMessage() {
    const text = textInput.value;
    if (text === '') return;

    db.collection("memos").add({
        text: text,
        tab: currentTabId, // ★現在のタブIDを保存
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isDone: false,
        replyTo: replyingTo ? replyingTo : null
    });

    textInput.value = '';
    cancelReply();
}

// ------------------------------------------------
// ユーティリティ・その他（前回とほぼ同じ）
// ------------------------------------------------
function renderMessage(id, data) {
    const card = document.createElement('div');
    card.classList.add('message-card');
    if (data.isDone) card.classList.add('done');

    let quoteHtml = '';
    if (data.replyTo) {
        quoteHtml = `<div class="quote-block">Re: ${escapeHtml(data.replyTo.text)}</div>`;
    }

    const date = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString('ja-JP') : '...';

    card.innerHTML = `
        ${quoteHtml}
        <div class="message-header">
            <span>${date}</span>
        </div>
        <div class="message-text">${escapeHtml(data.text)}</div>
        
        <div class="actions">
            <button class="action-btn" onclick="toggleDone('${id}', ${!data.isDone})">
                <span class="material-icons">${data.isDone ? 'check_box' : 'check_box_outline_blank'}</span>
            </button>
            <button class="action-btn" onclick="setReply('${escapeHtml(data.text)}')">
                <span class="material-icons">reply</span>
            </button>
            <button class="action-btn" onclick="deleteMessage('${id}')" style="color:#ff6b6b; opacity:0.6;">
                <span class="material-icons">delete</span>
            </button>
        </div>
    `;

    messageArea.appendChild(card);
}

// Hexカラー(#RRGGBB)を rgba(r,g,b, alpha) に変換する関数
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 以下、グローバル関数登録
window.toggleDone = function(id, status) {
    db.collection("memos").doc(id).update({ isDone: status });
}
window.setReply = function(text) {
    replyingTo = { text: text };
    replyTargetText.textContent = `返信: ${text.substring(0, 15)}...`;
    replyPreview.style.display = 'flex';
    textInput.focus();
}
window.cancelReply = function() {
    replyingTo = null;
    replyPreview.style.display = 'none';
}
window.deleteMessage = function(id) {
    if(confirm('削除しますか？')) {
        db.collection("memos").doc(id).delete();
    }
}
function escapeHtml(str) {
    if(!str) return "";
    return str.replace(/[&<>"']/g, match => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[match]));
}