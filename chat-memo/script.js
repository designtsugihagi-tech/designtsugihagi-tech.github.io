// ▼▼▼ あなたの設定データ（ここを修正しました） ▼▼▼
const firebaseConfig = {
  apiKey: "AIzaSyABw5Wm_zA8rJ9d-KPZhI4NrxeqjQsJQkY",
  authDomain: "chat-memo-8b4f0.firebaseapp.com",
  projectId: "chat-memo-8b4f0",
  storageBucket: "chat-memo-8b4f0.firebasestorage.app",
  messagingSenderId: "110934071534",
  appId: "1:110934071534:web:357b02e404c369abf3bbff"
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// Firebase初期化（import文を使わない書き方にしています）
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const messageArea = document.getElementById('message-area');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const replyPreview = document.getElementById('reply-preview');
const replyTargetText = document.getElementById('reply-target-text');

let replyingTo = null; // リプライ対象のデータを一時保存

// リアルタイムでデータを取得
db.collection("memos").orderBy("createdAt", "asc")
    .onSnapshot((snapshot) => {
        messageArea.innerHTML = ""; // 一旦クリア
        snapshot.forEach((doc) => {
            renderMessage(doc.id, doc.data());
        });
        window.scrollTo(0, document.body.scrollHeight);
    }, (error) => {
        console.error("データ取得エラー:", error);
        // もしここでエラーが出る場合、Firestoreデータベースが作成されていない可能性があります
    });

// 送信処理
sendBtn.addEventListener('click', sendMessage);
textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = textInput.value;
    if (text === '') return;

    db.collection("memos").add({
        text: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isDone: false,
        replyTo: replyingTo ? replyingTo : null
    })
    .then(() => {
        console.log("送信成功");
    })
    .catch((error) => {
        console.error("送信エラー:", error);
        alert("送信できませんでした。Firestoreの設定を確認してください。");
    });

    textInput.value = '';
    cancelReply();
}

// 画面表示処理
function renderMessage(id, data) {
    const card = document.createElement('div');
    card.classList.add('message-card');
    if (data.isDone) card.classList.add('done');

    let quoteHtml = '';
    if (data.replyTo) {
        quoteHtml = `<div class="quote-block">Re: ${escapeHtml(data.replyTo.text)}</div>`;
    }

    const date = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString('ja-JP') : '送信中...';

    card.innerHTML = `
        ${quoteHtml}
        <div class="message-header">
            <span>${date}</span>
        </div>
        <div class="message-text">${escapeHtml(data.text)}</div>
        
        <div class="actions">
            <button class="action-btn" onclick="toggleDone('${id}', ${!data.isDone})">
                <span class="material-icons">${data.isDone ? 'check_box' : 'check_box_outline_blank'}</span>
                ${data.isDone ? '済' : 'チェック'}
            </button>
            <button class="action-btn" onclick="setReply('${escapeHtml(data.text)}')">
                <span class="material-icons">reply</span> 返信
            </button>
            <button class="action-btn" onclick="deleteMessage('${id}')" style="color:#ff6b6b;">
                <span class="material-icons">delete</span>
            </button>
        </div>
    `;

    messageArea.appendChild(card);
}

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
    return str.replace(/[&<>"']/g, function(match) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[match];
    });
}