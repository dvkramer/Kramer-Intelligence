
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
const shareChatBtn = document.getElementById('share-chat-btn'); // Added
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
    saveChatBtn.classList.remove('hidden');
    shareChatBtn.classList.add('hidden');
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

    saveChatBtn.classList.add('hidden');
    shareChatBtn.classList.remove('hidden');

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
        const batch = writeBatch(firestore);
        const messages = await getDocs(collection(firestore, "chats", chatId, "messages"));
        messages.forEach(d => batch.delete(d.ref));
        await batch.commit();

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

    const parts = [];
    if (selectedFile) {
        const { base64, file } = selectedFile;
        parts.push({ inlineData: { mimeType: file.type, data: base64 } });
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

    chatInput.value = '';
    clearFileSelection();

    if (currentChatId) {
        await addDoc(collection(firestore, "chats", currentChatId, "messages"), userMsg);
    } else {
        history.push(userMsg);
        renderMessage(userMsg, chatContainer);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    showLoading(chatContainer);
    try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
        loadChat(chatRef.id);
    } catch (e) {
        console.error(e);
        alert("Failed to save chat.");
    }
}

async function shareChat() {
    if (!currentChatId) return alert("Chat must be saved before sharing.");
    const email = prompt("Enter user email to share with:");
    if (!email) return;

    try {
        const usersRef = collection(firestore, "users");
        const q = query(usersRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            alert("User not found.");
            return;
        }

        const userId = querySnapshot.docs[0].id;
        await updateDoc(doc(firestore, "chats", currentChatId), {
            collaborators: arrayUnion(userId)
        });
        alert("Shared successfully!");
    } catch (e) {
        console.error(e);
        alert("Failed to share.");
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
shareChatBtn.onclick = shareChat;
loginBtn.onclick = () => authModal.classList.remove('hidden');
logoutBtn.onclick = () => signOut(auth);
closeModalBtn.onclick = () => authModal.classList.add('hidden');

// Run
init();
