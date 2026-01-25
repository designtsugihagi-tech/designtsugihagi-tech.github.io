// ▼▼▼ ここをあなたの設定に書き換えてください ▼▼▼
const firebaseConfig = {
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyABw5Wm_zA8rJ9d-KPZhI4NrxeqjQsJQkY",
  authDomain: "chat-memo-8b4f0.firebaseapp.com",
  projectId: "chat-memo-8b4f0",
  storageBucket: "chat-memo-8b4f0.firebasestorage.app",
  messagingSenderId: "110934071534",
  appId: "1:110934071534:web:357b02e404c369abf3bbff"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// Firebase初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const messageArea = document.getElementById('message-area');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const replyPreview = document.getElementById('reply-preview');
const replyTargetText = document.getElementById('reply-target-text');

let replyingTo = null; // リプライ対象のデータを一時保存

// リアルタイムでデータを取得（同期の肝）
db.collection("memos").orderBy("createdAt", "asc")
    .onSnapshot((snapshot) => {
        messageArea.innerHTML = ""; // 一旦クリア
        snapshot.forEach((doc) => {
            renderMessage(doc.id, doc.data());
        });
        // 自動スクロール
        window.scrollTo(0, document.body.scrollHeight);
    });

// 送信処理
sendBtn.addEventListener('click', sendMessage);
textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = textInput.value;
    if (text === '') return;

    // データベースに追加
    db.collection("memos").add({
        text: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isDone: false, // 完了チェック用
        replyTo: replyingTo ? replyingTo : null // リプライ情報
    });

    textInput.value = '';
    cancelReply(); // リプライ状態解除
}

// 画面表示処理
function renderMessage(id, data) {
    const card = document.createElement('div');
    card.classList.add('message-card');
    if (data.isDone) card.classList.add('done');

    // リプライ（引用）がある場合
    let quoteHtml = '';
    if (data.replyTo) {
        quoteHtml = `<div class="quote-block">Re: ${escapeHtml(data.replyTo.text)}</div>`;
    }

    // 日付フォーマット
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

// 完了/未完了の切り替え
window.toggleDone = function(id, status) {
    db.collection("memos").doc(id).update({
        isDone: status
    });
}

// リプライモードにする
window.setReply = function(text) {
    replyingTo = { text: text };
    replyTargetText.textContent = `返信: ${text.substring(0, 15)}...`;
    replyPreview.style.display = 'flex';
    textInput.focus();
}

// リプライキャンセル
window.cancelReply = function() {
    replyingTo = null;
    replyPreview.style.display = 'none';
}

// メッセージ削除
window.deleteMessage = function(id) {
    if(confirm('削除しますか？')) {
        db.collection("memos").doc(id).delete();
    }
}

// HTMLエスケープ（セキュリティ用）
function escapeHtml(str) {
    if(!str) return "";
    return str.replace(/[&<>"']/g, function(match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[match];
    });
}