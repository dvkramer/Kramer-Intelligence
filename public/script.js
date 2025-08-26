// public/script.js

// Auth DOM elements
const authContainer = document.getElementById('auth-container');
const userInfo = document.getElementById('user-info');
const userEmail = document.getElementById('user-email');
const logoutButton = document.getElementById('logout-button');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');

// App container and sidebar
const appContainer = document.getElementById('app-container');
const sidebar = document.getElementById('sidebar');
const newChatButton = document.getElementById('new-chat-button');
const chatList = document.getElementById('chat-list');
const chatViewContainer = document.getElementById('chat-view-container');
const chatHeader = document.getElementById('chat-header');
const chatActions = document.getElementById('chat-actions');
const saveChatButton = document.getElementById('save-chat-button');
const shareChatButton = document.getElementById('share-chat-button');


// DOM element references
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input'); // Textarea
const sendButton = document.getElementById('send-button');
const chatHistory = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading');
const errorDisplay = document.getElementById('error');
const attachButton = document.getElementById('attach-button');
const fileUploadInput = document.getElementById('file-upload-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageButton = document.getElementById('remove-image-button');
const mainContentArea = document.getElementById('main-content-area');
const studyModeButton = document.getElementById('study-mode-button');
// <<< NEW DOM REFERENCE >>>
const pdfFilenamePreview = document.getElementById('pdf-filename-preview');

// --- Configuration ---
const MAX_FILE_SIZE_MB = 15; // Matches backend limit for inline uploads
const SCROLL_PADDING_TOP = 10; // Pixels above the AI message top when scrolling
// --- End Configuration ---

// --- State Variables ---
let chats = [];
let activeChatId = null;
let selectedFile = null;
let selectedFileType = null; // 'image' or 'pdf'
let selectedFileBase64 = null; // Data URL (includes prefix like 'data:image/png;base64,')
let isStudyModeActive = false;
let activeChatListener = null;
// --- End State Variables ---

// --- Event Listeners ---
messageInput.addEventListener('keydown', handleInputKeyDown);
sendButton.addEventListener('click', handleSendButtonClick);
studyModeButton.addEventListener('click', handleStudyModeToggle);
attachButton.addEventListener('click', () => {
    resetFileInput();
    fileUploadInput.click();
});
fileUploadInput.addEventListener('change', handleFileSelect);
removeImageButton.addEventListener('click', handleRemoveFile);
document.addEventListener('paste', handlePaste);
messageInput.addEventListener('input', adjustTextareaHeight);
// --- END Event Listeners ---

// --- Firebase Auth ---
let auth, firestore;
let currentUser = null;

// This function will be called once the firebase script is loaded
function initializeFirebase() {
    // These are now available on the window object from index.html
    auth = window.firebase.auth;
    firestore = window.firebase.firestore;

    const { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } = auth;

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in
            currentUser = user;
            userInfo.classList.remove('hidden');
            loginForm.classList.add('hidden');
            userEmail.textContent = user.email;
            appContainer.classList.remove('hidden');

            await loadUserChats();

            if (chats.length > 0) {
                loadChat(chats[0].id);
            } else {
                createNewChat();
            }
        } else {
            // User is signed out
            currentUser = null;
            chats = [];
            activeChatId = null;
            renderChatList();
            chatHistory.innerHTML = '';
            userInfo.classList.add('hidden');
            loginForm.classList.remove('hidden');
            appContainer.classList.add('hidden');
        }
    });

    newChatButton.addEventListener('click', createNewChat);

    saveChatButton.addEventListener('click', async () => {
        const activeChat = getActiveChat();
        if (!activeChat || activeChat.isSynced) {
            return;
        }

        const chatName = prompt("Enter a name for this chat:");
        if (!chatName || chatName.trim() === '') {
            return; // User cancelled or entered an empty name
        }

        try {
            const { collection, addDoc, doc, writeBatch, serverTimestamp } = window.firebase.firestore;

            // 1. Create a new chat document in Firestore
            const chatDocRef = await addDoc(collection(firestore, "chats"), {
                title: chatName,
                ownerId: currentUser.uid,
                collaborators: [currentUser.uid],
                createdAt: serverTimestamp()
            });

            // 2. Save all existing messages to a sub-collection
            const batch = writeBatch(firestore);
            const messagesColRef = collection(firestore, "chats", chatDocRef.id, "messages");
            activeChat.conversationHistory.forEach(message => {
                const messageDocRef = doc(messagesColRef);
                batch.set(messageDocRef, { ...message, createdAt: serverTimestamp(), senderId: message.role === 'user' ? currentUser.uid : null });
            });
            await batch.commit();

            // 3. Update local chat state
            activeChat.isSynced = true;
            activeChat.firestoreId = chatDocRef.id;
            activeChat.title = chatName;

            // 4. Refresh UI
            loadChat(activeChat.id);

        } catch (error) {
            console.error("Error saving chat to Firestore:", error);
            showError("Could not save chat to the cloud. Please try again.");
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const password = passwordInput.value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            showError(error.message);
        }
    });

    signupButton.addEventListener('click', async () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Also create a user document for email lookup
            const { doc, setDoc } = window.firebase.firestore;
            await setDoc(doc(firestore, "users", user.uid), {
                email: user.email
            });

        } catch (error) {
            showError(error.message);
        }
    });

    logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
        } catch (error) {
            showError(error.message);
        }
    });

    shareChatButton.addEventListener('click', () => {
        const activeChat = getActiveChat();
        if (!activeChat || !activeChat.isSynced) {
            showError("Only saved chats can be shared.");
            return;
        }
        const email = prompt("Enter the email address of the user you want to share this chat with:");
        if (email) {
            shareChatWithEmail(email);
        }
    });
}

// --- Chat Management ---
async function loadUserChats() {
    if (!currentUser) return;

    const { collection, query, where, orderBy, getDocs } = window.firebase.firestore;
    const chatsRef = collection(firestore, "chats");
    const q = query(chatsRef, where("collaborators", "array-contains", currentUser.uid), orderBy("createdAt", "desc"));

    try {
        const querySnapshot = await getDocs(q);
        const loadedChats = [];
        querySnapshot.forEach((doc) => {
            loadedChats.push({
                id: doc.id,
                firestoreId: doc.id,
                ...doc.data(),
                isSynced: true,
                conversationHistory: [] // Will be populated by listener
            });
        });
        chats = loadedChats;
        renderChatList();
    } catch (error) {
        console.error("Error loading user chats:", error);
        showError("Could not load your chats from the cloud.");
    }
}

function getActiveChat() {
    if (!activeChatId) return null;
    return chats.find(chat => chat.id === activeChatId);
}

function createNewChat() {
    const newChat = {
        id: `local-${Date.now()}`,
        title: 'New Chat',
        conversationHistory: [],
        isSynced: false,
        firestoreId: null
    };
    chats.unshift(newChat);
    loadChat(newChat.id);
}

function renderChatList() {
    chatList.innerHTML = '';
    chats.forEach(chat => {
        const li = document.createElement('li');
        li.textContent = chat.title;
        li.dataset.chatId = chat.id;
        if (chat.id === activeChatId) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => {
            loadChat(chat.id);
        });
        chatList.appendChild(li);
    });
}

function loadChat(chatId) {
    // Detach the old listener if it exists
    if (activeChatListener) {
        activeChatListener();
        activeChatListener = null;
    }

    activeChatId = chatId;
    const chat = chats.find(c => c.id === chatId);
    if (!chat) {
        console.error("Chat not found:", chatId);
        return;
    }

    chatHistory.innerHTML = '';

    // For local chats, just render what's in memory.
    if (!chat.isSynced) {
        chat.conversationHistory.forEach(msg => {
            const textPart = msg.parts.find(p => p.text);
            const text = textPart ? textPart.text : '';
            displayMessage(msg.role, text, null, null, msg.id);
        });
    }

    // Attach a new listener if the chat is synced
    if (chat.isSynced) {
        // Clear local history for synced chats, as the listener will repopulate it
        chat.conversationHistory = [];
        const { collection, query, orderBy, onSnapshot } = window.firebase.firestore;
        const messagesColRef = collection(firestore, "chats", chat.firestoreId, "messages");
        const q = query(messagesColRef, orderBy("createdAt"));

        activeChatListener = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const newMessage = change.doc.data();
                    // Avoid duplicating messages from the current user
                    if (newMessage.senderId === currentUser.uid && chat.conversationHistory.some(m => m.id === newMessage.id)) {
                        return;
                    }
                    if (!chat.conversationHistory.some(m => m.id === newMessage.id)) {
                        chat.conversationHistory.push(newMessage);
                        const textPart = newMessage.parts.find(p => p.text);
                        const text = textPart ? textPart.text : '';
                        displayMessage(newMessage.role, text, null, null, newMessage.id);
                    }
                }
            });
        });
    }

    const chatHeaderH1 = chatHeader.querySelector('h1');
    chatHeaderH1.textContent = chat.title;

    if (chat.isSynced) {
        saveChatButton.classList.add('hidden');
        shareChatButton.classList.remove('hidden');
    } else {
        saveChatButton.classList.remove('hidden');
        shareChatButton.classList.add('hidden');
    }

    renderChatList();
}

async function shareChatWithEmail(email) {
    const activeChat = getActiveChat();
    if (!activeChat || !activeChat.isSynced) {
        showError("The active chat is not saved to the cloud and cannot be shared.");
        return;
    }

    try {
        const { collection, query, where, getDocs, doc, updateDoc, arrayUnion } = window.firebase.firestore;

        // 1. Find the user by email
        const usersRef = collection(firestore, "users");
        const q = query(usersRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showError(`User with email "${email}" not found.`);
            return;
        }

        // 2. Get the collaborator's UID
        const collaboratorUid = querySnapshot.docs[0].id;
        const chatDocRef = doc(firestore, "chats", activeChat.firestoreId);

        // 3. Add the collaborator's UID to the chat document
        await updateDoc(chatDocRef, {
            collaborators: arrayUnion(collaboratorUid)
        });

        alert(`Chat successfully shared with ${email}.`);

    } catch (error) {
        console.error("Error sharing chat:", error);
        showError("An error occurred while trying to share the chat.");
    }
}


// --- Functions ---

// --- Mobile Detection Helper ---
function isMobileDevice() {
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
    const isLikelyMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return hasTouch && isLikelyMobileUA;
}
// --- END Mobile Detection Helper ---


// --- Textarea Height Adjustment ---
function adjustTextareaHeight() {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${messageInput.scrollHeight + 2}px`;
}

// --- Scrolling Functions ---
function scrollChatToBottom() {
    requestAnimationFrame(() => {
        mainContentArea.scrollTo({ top: mainContentArea.scrollHeight, behavior: 'smooth' });
    });
}

function scrollToMessageTop(messageElement) {
    const initialScrollTop = mainContentArea.scrollTop;
    const initialScrollHeight = mainContentArea.scrollHeight;
    const clientHeight = mainContentArea.clientHeight;
    const isNearBottomInitially = (initialScrollHeight - initialScrollTop - clientHeight) < 50;

    requestAnimationFrame(() => {
        const currentScrollTop = mainContentArea.scrollTop;
        if (isNearBottomInitially && currentScrollTop > initialScrollTop + 10) {
             console.log(`Scroll jumped down from ${initialScrollTop} to ${currentScrollTop} after adding AI message. Resetting.`);
             mainContentArea.scrollTop = initialScrollTop;
        }
        requestAnimationFrame(() => {
            const messageTopOffset = messageElement.offsetTop;
            let desiredScrollTop = Math.max(0, messageTopOffset - SCROLL_PADDING_TOP);
            const messageBottomOffset = messageTopOffset + messageElement.offsetHeight;
            const currentViewBottom = mainContentArea.scrollTop + mainContentArea.clientHeight;

            if (!(messageTopOffset >= mainContentArea.scrollTop && messageBottomOffset <= currentViewBottom)) {
                mainContentArea.scrollTo({ top: desiredScrollTop, behavior: 'smooth' });
            }
        });
    });
}
// --- END Scrolling Functions ---

// --- Input Handling ---
function handleInputKeyDown(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSendMessage(); } }
function handleSendButtonClick() { handleSendMessage(); }
// --- END Input Handling ---

// --- File Handling Functions ---

// **************************************************
// START MODIFIED SECTION for processSelectedFile
// **************************************************
function processSelectedFile(file) {
    if (!file) return false;

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
        showError('Invalid file type. Please select an image (PNG, JPG, WEBP, HEIC, HEIF) or a PDF.');
        handleRemoveFile();
        return false;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        showError(`File is too large (> ${MAX_FILE_SIZE_MB} MB). Max size for direct upload is limited.`);
        handleRemoveFile();
        return false;
    }

    hideError();
    const reader = new FileReader();

    reader.onload = (e) => {
        selectedFileBase64 = e.target.result; // Data URL (image or PDF)
        selectedFile = file;
        selectedFileType = isImage ? 'image' : 'pdf';

        // --- MINIMAL CHANGE V3 START (Icon + Filename) ---
        // Use the red-accented SVG Data URL for PDF icon
        const pdfSvgDataUrl = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%20width%3D%2264%22%20height%3D%2264%22%3E%3Cpath%20fill%3D%22%23E2E2E2%22%20d%3D%22M12%200%20H44%20L56%2012%20V60%20H12%20Z%22%2F%3E%3Cpath%20fill%3D%22%23CFCFCF%22%20d%3D%22M44%200%20L56%2012%20H44%20Z%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2275%25%22%20font-family%3D%22sans-serif%22%20font-size%3D%2214%22%20fill%3D%22%23D93025%22%20text-anchor%3D%22middle%22%20font-weight%3D%22bold%22%3EPDF%3C%2Ftext%3E%3C%2Fsvg%3E';

        // Configure the preview based on type
        if (isImage) {
            imagePreview.src = selectedFileBase64; // Show actual image data URL
            imagePreview.alt = `Image Preview: ${file.name}`;
            imagePreview.title = `Selected Image: ${file.name}`;
            pdfFilenamePreview.textContent = ''; // Clear filename text
            pdfFilenamePreview.style.display = 'none'; // Hide filename element
        } else { // For PDF
            imagePreview.src = pdfSvgDataUrl; // <<< USE SVG DATA URL
            imagePreview.alt = `PDF Icon: ${file.name}`;
            imagePreview.title = `Selected PDF: ${file.name}`;
            pdfFilenamePreview.textContent = file.name; // <<< SET Filename text
            pdfFilenamePreview.style.display = 'inline'; // <<< SHOW Filename element (CSS handles layout)
        }

        // Common UI updates: Show the preview container and update attach button
        imagePreviewContainer.classList.remove('hidden');
        attachButton.classList.add('has-file');
        // --- MINIMAL CHANGE V3 END ---

        console.log(`${selectedFileType.toUpperCase()} processed: ${file.name}`);
    };

    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading the selected file.");
        handleRemoveFile();
    };

    reader.readAsDataURL(file);
    return true;
}
// **************************************************
// END MODIFIED SECTION for processSelectedFile
// **************************************************


function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const processed = processSelectedFile(file);
    if (!processed) {
        resetFileInput();
    }
}

function handlePaste(event) {
    if (document.activeElement !== messageInput) return;
    const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const imageFile = item.getAsFile();
            if (imageFile) {
                if (selectedFile) handleRemoveFile(); // Clear previous selection first
                const processed = processSelectedFile(imageFile);
                if (processed) {
                    event.preventDefault();
                    console.log("Image paste handled successfully.");
                    break;
                } else {
                     console.log("Pasted image processing failed.");
                }
            }
        }
    }
}

// **************************************************
// START MODIFIED SECTION for handleRemoveFile
// **************************************************
function handleRemoveFile() {
    selectedFile = null;
    selectedFileBase64 = null;
    selectedFileType = null;
    imagePreview.src = '#'; // Clear preview src (removes image or SVG)
    pdfFilenamePreview.textContent = ''; // <<< CLEAR Filename text
    pdfFilenamePreview.style.display = 'none'; // <<< HIDE Filename element
    imagePreviewContainer.classList.add('hidden'); // Hide preview container
    resetFileInput(); // Clear the actual file input element
    attachButton.classList.remove('has-file'); // Update attach button style
    hideError(); // Clear any file-related errors
    console.log("Selected file removed.");
}
// **************************************************
// END MODIFIED SECTION for handleRemoveFile
// **************************************************

function resetFileInput() {
    fileUploadInput.value = null;
}
// --- END File Handling Functions ---


// --- Study Mode ---
function handleStudyModeToggle() {
    isStudyModeActive = !isStudyModeActive;
    studyModeButton.classList.toggle('active', isStudyModeActive);
    console.log(`Study Mode toggled: ${isStudyModeActive ? 'ON' : 'OFF'}`);
}
// --- END Study Mode ---

// --- Core Message Sending Logic ---

async function _sendMessageToServer() {
    const activeChat = getActiveChat();
    if (!activeChat) {
        showError("Cannot send message: No active chat.");
        return;
    }
    const historyToProcess = activeChat.conversationHistory;

    showLoading(); // Show loading at the start of the async operation
    try {
        const payload = {
            history: [...historyToProcess],
            isStudyModeActive: isStudyModeActive
        };
        console.log("Sending payload to /api/chat:", {
            historyLength: payload.history.length,
            studyMode: payload.isStudyModeActive
        });

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch (e) { console.warn("Could not parse API error JSON."); try { const txt = await response.text(); if(txt) errorMsg += `\nResponse: ${txt.substring(0,200)}...`; } catch(e2){} }
            if (response.status === 413) errorMsg = `Request Failed: Payload too large (${response.statusText}). Max file size is ~${MAX_FILE_SIZE_MB}MB.`;
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml;
        console.log(`AI Response received (using ${data.modelUsed || 'unknown model'})`);

        const aiMessageId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        // Update active chat's conversationHistory from within this function
        const activeChat = getActiveChat();
        if (activeChat) {
            activeChat.conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }], id: aiMessageId });
        }
        displayMessage('ai', aiResponseText, null, searchSuggestionHtml, aiMessageId);

    } catch (err) {
        console.error("Error during send/receive:", err);
        showError(err.message || "Failed to get response.");
        // No history rollback here for now, simplifying error recovery.
        // The user message that triggered this remains in history and UI.
    } finally {
        hideLoading();
        sendButton.disabled = false; // Re-enable send button in all cases
    }
}

async function handleSendMessage() {
    const userMessageText = messageInput.value.trim();
    if (!userMessageText && !selectedFile) return;

    sendButton.disabled = true; // Disable here, _sendMessageToServer will re-enable in its finally.
    // hideError(); // handleRemoveFile called later will hide error.
    // showLoading(); // _sendMessageToServer will handle its own loading indicator.

    const messageParts = [];
    let fileInfoForDisplay = null;

    if (selectedFileBase64 && selectedFile && selectedFileType) {
        messageParts.push({
            inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 }
        });
        if (selectedFileType === 'image') {
            fileInfoForDisplay = { type: 'image', dataUrl: selectedFileBase64, name: selectedFile.name };
        } else if (selectedFileType === 'pdf') {
             fileInfoForDisplay = { type: 'pdf', name: selectedFile.name };
        }
    }
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
    }

    if (messageParts.length === 0) { // Re-check if only file was selected then removed, or text was only spaces
        sendButton.disabled = false; // Re-enable send button
        console.warn("Message sending aborted: No parts prepared.");
        return;
    }

    const userMessageId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const activeChat = getActiveChat();
    if (!activeChat) {
        showError("No active chat. Please create a new chat first.");
        sendButton.disabled = false;
        return;
    }
    const messageObject = { role: 'user', parts: messageParts, id: userMessageId };
    activeChat.conversationHistory.push(messageObject);
    displayMessage('user', userMessageText || '', fileInfoForDisplay, null, userMessageId);

    if (activeChat.isSynced) {
        try {
            const { collection, addDoc, serverTimestamp } = window.firebase.firestore;
            const messagesColRef = collection(firestore, "chats", activeChat.firestoreId, "messages");
            await addDoc(messagesColRef, { ...messageObject, createdAt: serverTimestamp(), senderId: currentUser.uid });
        } catch (error) {
            console.error("Error saving new message to Firestore:", error);
            showError("Failed to save message to the cloud.");
            // Don't block the user from continuing the chat locally
        }
    }

    messageInput.value = '';
    handleRemoveFile(); // This also hides error via its own logic, which is fine.
    adjustTextareaHeight();

    if (isMobileDevice()) {
        messageInput.blur();
    } else {
        messageInput.focus();
    }

    await _sendMessageToServer(); // Call the refactored function
    // sendButton state will be managed by _sendMessageToServer's finally block.
}
// --- END Core Message Sending Logic ---


// --- Display & Formatting ---
function displayMessage(role, text, fileInfo = null, searchSuggestionHtml = null, messageId) {
    const messageEntryDiv = document.createElement('div');
    messageEntryDiv.classList.add('message-entry');
    if (messageId) {
        messageEntryDiv.dataset.messageEntryId = messageId;
    }
    if (role === 'user') {
        messageEntryDiv.classList.add('user-message-entry');
    } else {
        messageEntryDiv.classList.add('ai-message-entry');
    }

    const messageBubbleDiv = document.createElement('div');
    messageBubbleDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');
    if (messageId) {
        messageBubbleDiv.dataset.messageId = messageId;
    }
    let contentAddedToBubble = false;

    if (fileInfo && role === 'user') {
        if (fileInfo.type === 'image' && fileInfo.dataUrl) {
            const imgElement = document.createElement('img');
            imgElement.classList.add('message-image');
            imgElement.src = fileInfo.dataUrl;
            imgElement.alt = `User uploaded image: ${fileInfo.name || 'image'}`;
            imgElement.title = `Click to view image: ${fileInfo.name || 'image'}`;
            imgElement.addEventListener('click', () => window.open(fileInfo.dataUrl, '_blank'));
            messageBubbleDiv.appendChild(imgElement);
            contentAddedToBubble = true;
        } else if (fileInfo.type === 'pdf' && fileInfo.name) {
            const pdfInfoDiv = document.createElement('div');
            pdfInfoDiv.classList.add('pdf-info');
            pdfInfoDiv.textContent = `📎 Sent PDF: ${fileInfo.name}`;
            messageBubbleDiv.appendChild(pdfInfoDiv);
            contentAddedToBubble = true;
        }
    }

    if (text) {
        const paragraph = document.createElement('p');
        if (role === 'ai' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                marked.setOptions({ breaks: true, gfm: true });
                const rawHtml = marked.parse(text);
                paragraph.innerHTML = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
            } catch (error) {
                console.error("Markdown processing error:", error);
                paragraph.textContent = text; // Fallback
            }
        } else {
            paragraph.textContent = text;
        }
        if (paragraph.innerHTML.trim() || paragraph.textContent.trim()) {
             messageBubbleDiv.appendChild(paragraph);
             contentAddedToBubble = true;
        }
    }

    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container');
        try {
            suggestionContainer.innerHTML = searchSuggestionHtml;
            if (suggestionContainer.innerHTML.trim()) {
                 messageBubbleDiv.appendChild(suggestionContainer);
                 contentAddedToBubble = true;
            }
        } catch (error) { console.error("Error setting innerHTML for search suggestions:", error); }
    }

    const actionButtonBar = document.createElement('div');
    actionButtonBar.classList.add('action-button-bar'); // Base class
    actionButtonBar.classList.add('message-action-buttons'); // New generic class for the bar itself
    if (role === 'user') {
        actionButtonBar.classList.add('user-actions-align'); // For aligning content (buttons) inside
    } else {
        actionButtonBar.classList.add('ai-actions-align');   // For aligning content (buttons) inside
    }
    if (messageId) {
        actionButtonBar.dataset.controlsMessageId = messageId;
    }

    // Add Edit button for user messages
    if (role === 'user' && contentAddedToBubble) {
        const editButton = document.createElement('button');
        editButton.classList.add('edit-btn');
        editButton.textContent = '✏️';
        editButton.title = 'Edit this message';

        editButton.addEventListener('click', (event) => {
            const originalEditButton = event.currentTarget;
            const currentActionBar = originalEditButton.closest('.action-button-bar');
            if (!currentActionBar) return;

            const messageIdForEdit = currentActionBar.dataset.controlsMessageId;
            if (!messageIdForEdit) {
                console.error('Could not find message ID for editing from action bar.');
                return;
            }

            const messageEntry = currentActionBar.closest('.message-entry');
            if (!messageEntry) return;
            const messageBubble = messageEntry.querySelector('.message.user-message');
            if(!messageBubble) return;

            const messageIndex = conversationHistory.findIndex(msg => msg.id === messageIdForEdit);
            if (messageIndex === -1) {
                console.error('Message to edit not found in history.');
                return;
            }
            const messageObject = conversationHistory[messageIndex];

            const textPart = messageObject.parts.find(part => typeof part.text === 'string');
            const originalText = textPart ? textPart.text : '';
            const originalBubbleHTML = messageBubble.innerHTML; // Store original HTML

            originalEditButton.style.display = 'none';
            messageBubble.innerHTML = ''; // Clear the bubble for textarea

            const textarea = document.createElement('textarea');
            textarea.classList.add('edit-message-textarea');
            textarea.value = originalText;
            messageBubble.appendChild(textarea); // Place textarea directly in bubble

            const saveButton = document.createElement('button');
            saveButton.classList.add('save-edit-btn');
            saveButton.textContent = '✅';
            saveButton.title = 'Save changes';

            const cancelButton = document.createElement('button');
            cancelButton.classList.add('cancel-edit-btn');
            cancelButton.textContent = '❌';
            cancelButton.title = 'Cancel edit';

            cancelButton.addEventListener('click', () => {
                messageBubble.innerHTML = originalBubbleHTML; // Restore original content
                currentActionBar.innerHTML = ''; // Clear save/cancel
                currentActionBar.appendChild(originalEditButton); // Add original edit button back
                originalEditButton.style.display = '';
            });

            saveButton.addEventListener('click', async () => {
                saveButton.disabled = true;
                cancelButton.disabled = true;
                textarea.disabled = true;

                const newText = textarea.value.trim();
                let textPartToUpdate = messageObject.parts.find(part => typeof part.text === 'string');
                if (textPartToUpdate) {
                    textPartToUpdate.text = newText;
                } else {
                    messageObject.parts.push({ text: newText });
                }

                if (messageIndex < conversationHistory.length - 1) {
                    conversationHistory.splice(messageIndex + 1);
                }

                let currentMsgEntry = messageEntry.nextElementSibling;
                while (currentMsgEntry) {
                    const nextEntry = currentMsgEntry.nextElementSibling;
                    currentMsgEntry.remove();
                    currentMsgEntry = nextEntry;
                }

                messageBubble.innerHTML = ''; // Clear textarea
                const p = document.createElement('p');
                p.textContent = newText;
                messageBubble.appendChild(p); // Display new text

                currentActionBar.innerHTML = ''; // Clear save/cancel
                currentActionBar.appendChild(originalEditButton);
                originalEditButton.style.display = '';

                await _sendMessageToServer(conversationHistory);
            });

            currentActionBar.innerHTML = ''; // Clear Edit button
            currentActionBar.appendChild(saveButton);
            currentActionBar.appendChild(cancelButton);
            textarea.focus();
        });
        actionButtonBar.appendChild(editButton);
    }

    // Add Regenerate button for AI messages
    if (role === 'ai' && contentAddedToBubble) {
        // Remove regenerate buttons from previous AI messages' action bars
        const allActionBars = chatHistory.querySelectorAll('.action-button-bar');
        allActionBars.forEach(bar => {
            const oldRegenBtn = bar.querySelector('.regenerate-btn');
            if (oldRegenBtn) oldRegenBtn.remove();
        });

        const regenerateButton = document.createElement('button');
        regenerateButton.classList.add('regenerate-btn');
        regenerateButton.textContent = '↺';
        regenerateButton.title = 'Regenerate this response';

        regenerateButton.addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.disabled = true;

            const currentActionBar = button.closest('.action-button-bar');
            if (!currentActionBar) return;
            const messageIdToRegenerate = currentActionBar.dataset.controlsMessageId;

            if (!messageIdToRegenerate) {
                console.error('Could not find message ID for regeneration from action bar.');
                button.disabled = false;
                return;
            }

            const messageIndex = conversationHistory.findIndex(msg => msg.id === messageIdToRegenerate);
            if (messageIndex === -1) {
                console.error('Message to regenerate not found in history.');
                button.disabled = false;
                return;
            }

            if (conversationHistory[messageIndex].role !== 'model') {
                console.error('Attempted to regenerate a non-AI message.');
                button.disabled = false;
                return;
            }

            conversationHistory.splice(messageIndex, 1);

            const entryToRemove = currentActionBar.closest('.message-entry');
            if (entryToRemove) {
                entryToRemove.remove();
            }

            await _sendMessageToServer(conversationHistory);
        });
        actionButtonBar.appendChild(regenerateButton);
    }

    if (contentAddedToBubble) {
        messageEntryDiv.appendChild(messageBubbleDiv);
        messageEntryDiv.appendChild(actionButtonBar);
        chatHistory.appendChild(messageEntryDiv);

        if (role === 'user') {
            scrollChatToBottom();
        } else if (role === 'ai') {
             setTimeout(() => scrollToMessageTop(messageBubbleDiv), 50);
        }
    } else {
         console.warn("Skipped appending an empty message.");
    }
}
// --- END Display & Formatting ---

// --- UI Utility Functions ---
function showLoading() { loadingIndicator.classList.remove('hidden'); }
function hideLoading() { loadingIndicator.classList.add('hidden'); }
function showError(message) { errorDisplay.textContent = message; errorDisplay.classList.remove('hidden'); console.error("Displaying error:", message); errorDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function hideError() { errorDisplay.classList.add('hidden'); errorDisplay.textContent = ''; }
// --- END UI Utility Functions ---


// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // Poll for Firebase to be ready
    const interval = setInterval(() => {
        if (window.firebase && window.firebase.auth && window.firebase.firestore) {
            clearInterval(interval);
            initializeFirebase();
            messageInput.focus();
            adjustTextareaHeight();
            console.log("Kramer Intelligence script initialized.");
        }
    }, 100);
});
// --- END Initial Setup ---