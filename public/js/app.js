
import { initFirebase, auth, firestore, collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, orderBy, doc, setDoc, deleteDoc, updateDoc, arrayUnion, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, writeBatch } from './firebase-service.js';
import { sendMessageToBackend } from './api-service.js';
import { renderMessage, clearChat, showLoading, hideLoading, renderChatList } from './ui.js';

// State
let currentUser = null;
let currentChatId = null;
let history = []; // Local history for current chat
let unsubscribeMessages = null;
let selectedFile = null;

// DOM Elements
const chatContainer = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const chatListContainer = document.getElementById('chat-list-items');
const newChatBtn = document.getElementById('new-chat-btn');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const saveChatBtn = document.getElementById('save-chat-btn');
const authModal = document.getElementById('auth-modal');
const closeModalBtn = document.getElementById('close-modal');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');
const toggleAuth = document.getElementById('toggle-auth');
const filePreview = document.getElementById('file-preview');
const filePreviewImg = document.getElementById('file-preview-img');
const filePreviewName = document.getElementById('file-preview-name');
const removeFileBtn = document.getElementById('remove-file-btn');

// Init
async function init() {
    await initFirebase();

    onAuthStateChanged(auth, user => {
        currentUser = user;
        if (user) {
            document.body.classList.add('logged-in');
            userInfo.innerText = user.email;
            loadChatList();
        } else {
            document.body.classList.remove('logged-in');
            chatListContainer.innerHTML = '';
            startNewChat();
        }
    });
}

// Logic
function startNewChat() {
    if (unsubscribeMessages) unsubscribeMessages();
    currentChatId = null;
    history = [];
    clearChat(chatContainer);
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
}

async function loadChatList() {
    if (!currentUser) return;
    const q = query(collection(firestore, "chats"), where("collaborators", "array-contains", currentUser.uid), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const chats = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderChatList(chats, chatListContainer, loadChat, deleteChat);
}

async function loadChat(chatId) {
    if (currentChatId === chatId) return;
    startNewChat();
    currentChatId = chatId;

    // Highlight active
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    // Add active class logic if we had IDs on elements, re-rendering list is easier but costly.
    // Simplification: just re-render list or handle in UI logic. For now, just load messages.

    const messagesRef = collection(firestore, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        clearChat(chatContainer);
        history = [];
        snapshot.forEach(doc => {
            const msg = doc.data();
            history.push(msg);
            renderMessage(msg, chatContainer);
        });
        chatContainer.scrollTop = chatContainer.scrollHeight;
    });
}

async function deleteChat(chatId) {
    if (!confirm("Delete this chat?")) return;
    try {
        // Delete messages
        const batch = writeBatch(firestore);
        const messages = await getDocs(collection(firestore, "chats", chatId, "messages"));
        messages.forEach(d => batch.delete(d.ref));
        await batch.commit();

        // Delete chat doc
        await deleteDoc(doc(firestore, "chats", chatId));
        loadChatList();
        if (currentChatId === chatId) startNewChat();
    } catch (e) {
        console.error("Delete error", e);
        alert("Failed to delete chat");
    }
}

async function handleSend() {
    const text = chatInput.value.trim();
    if (!text && !selectedFile) return;

    // Prepare User Message
    const parts = [];

    if (selectedFile) {
        const { base64, file } = selectedFile;
        // For Backend
        parts.push({ inlineData: { mimeType: file.type, data: base64 } });
        // For Display/Storage
        parts.push({
            fileInfoForDisplay: {
                type: file.type.startsWith('image/') ? 'image' : 'pdf',
                dataUrl: file.type.startsWith('image/') ? `data:${file.type};base64,${base64}` : null,
                name: file.name
            }
        });
    }

    if (text) parts.push({ text });

    const userMsg = { role: 'user', parts, createdAt: serverTimestamp() };

    // Clear Input
    chatInput.value = '';
    clearFileSelection();

    // Optimistic UI or Firestore Save
    if (currentChatId) {
        // Synced Chat
        await addDoc(collection(firestore, "chats", currentChatId, "messages"), userMsg);
    } else {
        // Local Chat
        history.push(userMsg);
        renderMessage(userMsg, chatContainer);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // API Call
    showLoading(chatContainer);
    try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        // If synced, we usually send full history. If local, we send history variable.
        // For synced, we might need to fetch latest history or just trust local array if kept in sync.
        // In `loadChat`, we update `history`. So `history` should be up to date.

        const response = await sendMessageToBackend(history, timezone);

        const aiMsg = {
            role: 'model',
            parts: [{ text: response.text }],
            searchSuggestionHtml: response.searchSuggestionHtml,
            createdAt: serverTimestamp()
        };

        if (currentChatId) {
            await addDoc(collection(firestore, "chats", currentChatId, "messages"), aiMsg);
        } else {
            history.push(aiMsg);
            hideLoading();
            renderMessage(aiMsg, chatContainer);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    } catch (error) {
        hideLoading();
        alert(`Error: ${error.message}`);
    }
}

async function saveChat() {
    if (!currentUser) return alert("Please login to save chats.");
    if (currentChatId) return alert("Chat already saved.");

    const title = prompt("Chat Title:", "New Chat");
    if (!title) return;

    try {
        const chatRef = await addDoc(collection(firestore, "chats"), {
            title,
            ownerId: currentUser.uid,
            collaborators: [currentUser.uid],
            createdAt: serverTimestamp()
        });

        const batch = writeBatch(firestore);
        const msgCol = collection(firestore, "chats", chatRef.id, "messages");
        history.forEach(msg => {
             const ref = doc(msgCol);
             batch.set(ref, msg);
        });
        await batch.commit();

        currentChatId = chatRef.id;
        loadChatList();
        loadChat(chatRef.id); // switch to synced mode
    } catch (e) {
        console.error(e);
        alert("Failed to save chat.");
    }
}

// Auth UI
let isLoginMode = true;
toggleAuth.onclick = () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? "Login" : "Sign Up";
    authSubmit.innerText = isLoginMode ? "Login" : "Sign Up";
    toggleAuth.innerText = isLoginMode ? "Need an account? Sign up" : "Have an account? Login";
};

authForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = authForm.email.value;
    const password = authForm.password.value;

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(firestore, "users", cred.user.uid), { email });
        }
        authModal.classList.add('hidden');
        authForm.reset();
    } catch (error) {
        alert(error.message);
    }
};

// File Handling
fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        selectedFile = { file, base64 };

        filePreview.classList.remove('hidden');
        if (file.type.startsWith('image/')) {
            filePreviewImg.src = e.target.result;
            filePreviewImg.classList.remove('hidden');
        } else {
            filePreviewImg.classList.add('hidden');
        }
        filePreviewName.innerText = file.name;
    };
    reader.readAsDataURL(file);
};

function clearFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
}

removeFileBtn.onclick = clearFileSelection;
attachBtn.onclick = () => fileInput.click();
sendBtn.onclick = handleSend;
chatInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
newChatBtn.onclick = startNewChat;
saveChatBtn.onclick = saveChat;
loginBtn.onclick = () => authModal.classList.remove('hidden');
logoutBtn.onclick = () => signOut(auth);
closeModalBtn.onclick = () => authModal.classList.add('hidden');

// Run
init();
