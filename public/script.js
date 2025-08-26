// public/script.js

// --- Firebase Services ---
const {
    auth,
    firestore,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    doc,
    setDoc,
    getDoc,
    addDoc,
    collection,
    query,
    where,
    getDocs,
    onSnapshot,
    serverTimestamp,
    orderBy,
    updateDoc,
    arrayUnion,
    writeBatch
} = window.firebase;


// --- DOM Element References ---
const menuButton = document.getElementById('menu-button');

// Auth
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const authModal = document.getElementById('auth-modal');
const modalCloseButton = document.querySelector('.modal-close-button');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const showSignup = document.getElementById('show-signup');
const showLogin = document.getElementById('show-login');
const loginView = document.getElementById('login-view');
const signupView = document.getElementById('signup-view');
const userInfo = document.getElementById('user-info');
const userEmail = document.getElementById('user-email');

// Sidebar and Chat Controls
const sidebar = document.getElementById('sidebar');
const chatList = document.getElementById('chat-list');
const newChatButton = document.getElementById('new-chat-button');
const chatControls = document.getElementById('chat-controls');
const saveChatButton = document.getElementById('save-chat-button');
const shareChatButton = document.getElementById('share-chat-button');

// Existing Chat Elements
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
const pdfFilenamePreview = document.getElementById('pdf-filename-preview');


// --- Configuration ---
const MAX_FILE_SIZE_MB = 15; // Matches backend limit for inline uploads
const SCROLL_PADDING_TOP = 10; // Pixels above the AI message top when scrolling
// --- End Configuration ---

// --- State Variables ---
let currentUser = null;
let currentChat = { id: null, isSynced: false, ownerId: null }; // id is the Firestore doc ID
let conversationHistory = []; // This will now represent the messages of the *current* chat
let unsubscribeMessages = () => {}; // Function to unsubscribe from Firestore listener
let selectedFile = null;
let selectedFileType = null; // 'image' or 'pdf'
let selectedFileBase64 = null; // Data URL (includes prefix like 'data:image/png;base64,')
let isStudyModeActive = false;
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

async function _sendMessageToServer(historyToProcess) {
    // If the chat is synced, we don't need to display the AI message here.
    // The onSnapshot listener will handle it. We just need to save the AI response to Firestore.
    const shouldDisplayAiMessage = !currentChat.isSynced;

    showLoading();
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
    const aiMessageParts = [{ text: aiResponseText }];
    if (searchSuggestionHtml) {
        aiMessageParts.push({ searchSuggestionHtml: searchSuggestionHtml });
    }
    const aiMessage = { role: 'model', parts: aiMessageParts, id: aiMessageId };

        if (currentChat.isSynced) {
            await addDoc(collection(firestore, "chats", currentChat.id, "messages"), {
                ...aiMessage,
                createdAt: serverTimestamp()
            });
            // The snapshot listener will handle displaying the message.
        } else {
            // For local chats, update history and display manually.
            conversationHistory.push(aiMessage);
            displayMessage('ai', aiResponseText, null, searchSuggestionHtml, aiMessageId);
        }

    } catch (err) {
        console.error("Error during send/receive:", err);
        showError(err.message || "Failed to get response.");
    } finally {
        hideLoading();
        sendButton.disabled = false;
    }
}

async function handleSendMessage() {
    const userMessageText = messageInput.value.trim();
    if (!userMessageText && !selectedFile) return;

    if (!currentUser && currentChat.isSynced) {
        showError("You must be logged in to send messages in a synced chat.");
        return;
    }

    sendButton.disabled = true;

    const messageParts = [];
    let fileInfoForDisplay = null;

    if (selectedFileBase64 && selectedFile && selectedFileType) {
        // This part sends the raw data to the Gemini API
        const inlineDataForApi = {
            inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 }
        };
        messageParts.push(inlineDataForApi);

        // This part structures the data for display and saving to Firestore
        if (selectedFileType === 'image') {
            fileInfoForDisplay = { type: 'image', dataUrl: selectedFileBase64, name: selectedFile.name };
        } else if (selectedFileType === 'pdf') {
            fileInfoForDisplay = { type: 'pdf', name: selectedFile.name };
        }
        // Embed the display info directly in a part that gets saved
        if (fileInfoForDisplay) {
            messageParts.push({ fileInfoForDisplay: fileInfoForDisplay });
        }
    }
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
    }

    if (messageParts.length === 0) {
        sendButton.disabled = false;
        console.warn("Message sending aborted: No parts prepared.");
        return;
    }

    const userMessageId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const userMessage = { role: 'user', parts: messageParts, id: userMessageId };

    // For synced chats, don't display the message immediately. Let the snapshot listener do it.
    // For local chats, display it right away.
    if (!currentChat.isSynced) {
        conversationHistory.push(userMessage);
        displayMessage('user', userMessageText || '', fileInfoForDisplay, null, userMessageId);
    }

    // If chat is synced, save user message to Firestore.
    if (currentChat.isSynced) {
        try {
            await addDoc(collection(firestore, "chats", currentChat.id, "messages"), {
                ...userMessage,
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Error saving user message:", error);
            showError("Failed to send message. " + error.message);
            sendButton.disabled = false;
            return;
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

    await _sendMessageToServer(conversationHistory); // Call the refactored function
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
        if ((role === 'ai' || role === 'model') && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                marked.setOptions({ breaks: true, gfm: true });
                const rawHtml = marked.parse(text);
                paragraph.innerHTML = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
            } catch (error) {
                console.error("Markdown processing error:", error);
                paragraph.textContent = text; // Fallback
            }
        } else {
            paragraph.innerText = text;
        }
        if (paragraph.innerHTML.trim() || paragraph.textContent.trim()) {
             messageBubbleDiv.appendChild(paragraph);
             contentAddedToBubble = true;
        }
    }

    if ((role === 'ai' || role === 'model') && searchSuggestionHtml) {
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

                // If chat is synced, perform an update in Firestore and do not regenerate.
                if (currentChat.isSynced) {
                    if (!messageObject.firestoreId) {
                        console.error("Cannot edit synced message: firestoreId is missing.", messageObject);
                        showError("Cannot save edit: message is missing its database ID.");
                        saveButton.disabled = false;
                        cancelButton.disabled = false;
                        textarea.disabled = false;
                        return;
                    }

                    try {
                        const messageRef = doc(firestore, "chats", currentChat.id, "messages", messageObject.firestoreId);

                        // Find the text part and update it.
                        let textPartToUpdate = messageObject.parts.find(part => typeof part.text === 'string');
                        if (textPartToUpdate) {
                            textPartToUpdate.text = newText;
                        } else {
                            // If for some reason there was no text part, add one.
                            messageObject.parts.push({ text: newText });
                        }

                        await updateDoc(messageRef, {
                            parts: messageObject.parts
                        });

                        // The onSnapshot listener will handle the UI update automatically.
                        // The save/cancel buttons will be removed when the chat history is re-rendered.
                        console.log("Message updated in Firestore.");
                    } catch (error) {
                        console.error("Error updating message:", error);
                        showError("Failed to save edit. " + error.message);
                        // Re-enable buttons to allow user to try again or cancel.
                        saveButton.disabled = false;
                        cancelButton.disabled = false;
                        textarea.disabled = false;
                    }

                } else {
                    // This is the existing logic for non-synced chats (edit and regenerate)
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
                }
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
            if (!currentActionBar) { button.disabled = false; return; }
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

            if (currentChat.isSynced) {
                try {
                    const historyForRegen = conversationHistory.slice(0, messageIndex);
                    const messagesToDelete = conversationHistory.slice(messageIndex);
                    const firestoreIdsToDelete = messagesToDelete.map(msg => msg.firestoreId).filter(id => id);

                    if (firestoreIdsToDelete.length > 0) {
                        const batch = writeBatch(firestore);
                        firestoreIdsToDelete.forEach(id => {
                            const msgRef = doc(firestore, "chats", currentChat.id, "messages", id);
                            batch.delete(msgRef);
                        });
                        await batch.commit();
                        console.log(`Batch deleted ${firestoreIdsToDelete.length} messages for regeneration.`);
                    }

                    await _sendMessageToServer(historyForRegen);
                } catch (error) {
                    console.error("Error during synced regeneration:", error);
                    showError("Failed to regenerate response. " + error.message);
                    button.disabled = false;
                }
            } else {
                // Corrected logic for local chats
                conversationHistory.splice(messageIndex);

                const messageEntryToStartRemoval = document.querySelector(`[data-message-entry-id="${messageIdToRegenerate}"]`);
                if (messageEntryToStartRemoval) {
                    let currentMsgEntry = messageEntryToStartRemoval;
                    while (currentMsgEntry) {
                        const nextEntry = currentMsgEntry.nextElementSibling;
                        currentMsgEntry.remove();
                        currentMsgEntry = nextEntry;
                    }
                }
                await _sendMessageToServer(conversationHistory);
            }
        });
        actionButtonBar.appendChild(regenerateButton);
    }

    if (contentAddedToBubble) {
        messageEntryDiv.appendChild(messageBubbleDiv);
        messageEntryDiv.appendChild(actionButtonBar);
        chatHistory.appendChild(messageEntryDiv);

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

// --- Authentication UI Logic ---
function showAuthModal() { authModal.classList.remove('hidden'); }
function hideAuthModal() { authModal.classList.add('hidden'); }

loginButton.addEventListener('click', showAuthModal);
modalCloseButton.addEventListener('click', hideAuthModal);

showSignup.addEventListener('click', (e) => {
    e.preventDefault();
    loginView.classList.add('hidden');
    signupView.classList.remove('hidden');
});

showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    signupView.classList.add('hidden');
    loginView.classList.remove('hidden');
});

// --- Firebase Authentication ---

function startNewChat() {
    console.log("Starting new chat.");
    unsubscribeMessages(); // Stop listening to old chat
    currentChat = { id: null, isSynced: false, ownerId: null };
    conversationHistory = [];
    chatHistory.innerHTML = '';
    saveChatButton.classList.remove('hidden');
    shareChatButton.classList.add('hidden');
    document.querySelectorAll('.chat-list-item').forEach(item => item.classList.remove('active'));
}

newChatButton.addEventListener('click', startNewChat);

async function saveCurrentChat() {
    if (!currentUser) {
        showError("You must be logged in to save a chat.");
        return;
    }
    if (currentChat.isSynced) {
        showError("This chat is already saved.");
        return;
    }

    const chatTitle = prompt("Enter a name for this chat:");
    if (!chatTitle) return;

    try {
        // 1. Create the main chat document
        const chatRef = await addDoc(collection(firestore, "chats"), {
            title: chatTitle,
            ownerId: currentUser.uid,
            collaborators: [currentUser.uid],
            createdAt: serverTimestamp()
        });

        console.log("Chat document created with ID:", chatRef.id);

        // 2. Save all existing messages to the messages sub-collection
        const messagesCol = collection(firestore, "chats", chatRef.id, "messages");
        for (const message of conversationHistory) {
            await addDoc(messagesCol, {
                ...message,
                createdAt: serverTimestamp() // Add timestamp for ordering
            });
        }

        // 3. Update local state
        currentChat.id = chatRef.id;
        currentChat.isSynced = true;
        currentChat.ownerId = currentUser.uid;

        // 4. Update UI
        saveChatButton.classList.add('hidden');
        shareChatButton.classList.remove('hidden');

        // TODO: Add chat to sidebar list and attach real-time listener
        alert("Chat saved successfully!");

    } catch (error) {
        console.error("Error saving chat:", error);
        showError("Failed to save chat. " + error.message);
    }
}

saveChatButton.addEventListener('click', saveCurrentChat);


async function shareChat() {
    if (!currentChat.isSynced || !currentChat.id) {
        showError("This chat must be saved to the cloud before it can be shared.");
        return;
    }

    const emailToShare = prompt("Enter the email address of the user you want to share with:");
    if (!emailToShare) return;

    try {
        // 1. Find the user to share with by their email
        const usersRef = collection(firestore, "users");
        const q = query(usersRef, where("email", "==", emailToShare));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showError(`No user found with the email: ${emailToShare}`);
            return;
        }

        // 2. Get the collaborator's user ID
        const collaboratorId = querySnapshot.docs[0].id;
        const chatRef = doc(firestore, "chats", currentChat.id);

        // 3. Add the collaborator's ID to the chat's 'collaborators' array
        await updateDoc(chatRef, {
            collaborators: arrayUnion(collaboratorId)
        });

        alert(`Chat successfully shared with ${emailToShare}!`);

    } catch (error) {
        console.error("Error sharing chat:", error);
        showError("Failed to share chat. " + error.message);
    }
}

shareChatButton.addEventListener('click', shareChat);


async function loadUserChats(userId) {
    chatList.innerHTML = ''; // Clear previous list
    const q = query(collection(firestore, "chats"), where("collaborators", "array-contains", userId));
    try {
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            displayChatInSidebar(doc.id, doc.data());
        });
    } catch (error) {
        console.error("Error loading user chats:", error);
        showError("Could not load your chats. " + error.message);
    }
}

function displayChatInSidebar(chatId, chatData) {
    const chatItem = document.createElement('div');
    chatItem.classList.add('chat-list-item');
    chatItem.textContent = chatData.title;
    chatItem.dataset.chatId = chatId;
    chatItem.addEventListener('click', () => loadChat(chatId));
    chatList.appendChild(chatItem);
}

async function loadChat(chatId) {
    console.log(`Loading chat: ${chatId}`);
    unsubscribeMessages(); // Unsubscribe from any previous chat listener

    // Update active chat in sidebar
    document.querySelectorAll('.chat-list-item').forEach(item => {
        item.classList.toggle('active', item.dataset.chatId === chatId);
    });

    chatHistory.innerHTML = ''; // Clear the display
    conversationHistory = []; // Clear local history

    try {
        const chatDoc = await getDoc(doc(firestore, "chats", chatId));
        if (!chatDoc.exists()) {
            showError("Chat not found.");
            return;
        }

        const chatData = chatDoc.data();
        currentChat = {
            id: chatId,
            isSynced: true,
            ownerId: chatData.ownerId
        };

        // Update UI
        saveChatButton.classList.add('hidden');
        shareChatButton.classList.remove('hidden');

        // Listen for real-time messages
        let isInitialChatLoad = true;
        const messagesQuery = query(collection(firestore, "chats", chatId, "messages"), orderBy("createdAt"));
        unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
            const oldMessageCount = conversationHistory.length;

            chatHistory.innerHTML = ''; // Clear display on new snapshot
            conversationHistory = []; // Clear local history
            snapshot.forEach(doc => {
                const message = { ...doc.data(), firestoreId: doc.id };
                conversationHistory.push(message);

                let textPart = '';
                let searchSuggestionHtml = null;
                let fileInfoForDisplay = null;

                if (Array.isArray(message.parts)) {
                    for (const part of message.parts) {
                        if (part && typeof part === 'object') {
                            if ('text' in part) {
                                textPart = part.text;
                            }
                            if ('searchSuggestionHtml' in part) {
                                searchSuggestionHtml = part.searchSuggestionHtml;
                            }
                            if ('fileInfoForDisplay' in part) {
                                fileInfoForDisplay = part.fileInfoForDisplay;
                            }
                        }
                    }
                }
                displayMessage(message.role, textPart, fileInfoForDisplay, searchSuggestionHtml, message.id);
            });

            const newMessageCount = conversationHistory.length;
            const wasMessageAdded = newMessageCount > oldMessageCount;

            if (isInitialChatLoad) {
                scrollChatToBottom();
            } else if (wasMessageAdded) {
                const lastMessage = conversationHistory[newMessageCount - 1];
                const lastMessageBubble = chatHistory.lastElementChild?.querySelector('.message');

                if (lastMessageBubble) {
                    if (lastMessage.role === 'model' || lastMessage.role === 'ai') {
                        setTimeout(() => scrollToMessageTop(lastMessageBubble), 100);
                    } else {
                        scrollChatToBottom();
                    }
                }
            }
            isInitialChatLoad = false;
        }, (error) => {
            console.error("Error listening to messages:", error);
            showError("Error loading messages. " + error.message);
        });

    } catch (error) {
        console.error("Error loading chat:", error);
        showError("Could not load chat. " + error.message);
    }
}

onAuthStateChanged(auth, user => {
    if (user) {
        // User is signed in
        console.log("User logged in:", user.email);
        currentUser = user;
        userInfo.classList.remove('hidden');
        userEmail.textContent = user.email;
        loginButton.classList.add('hidden');
        chatControls.classList.remove('hidden');
        hideAuthModal();
        startNewChat();
        loadUserChats(user.uid);
    } else {
        // User is signed out
        console.log("User logged out.");
        currentUser = null;
        userInfo.classList.add('hidden');
        userEmail.textContent = '';
        loginButton.classList.remove('hidden');
        chatControls.classList.add('hidden');
        chatList.innerHTML = ''; // Clear chat list
        startNewChat(); // Reset to a clean state
    }
});

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        // Create a document in the 'users' collection
        await setDoc(doc(firestore, "users", user.uid), {
            email: user.email
        });
        console.log("User signed up and document created in Firestore.");
    } catch (error) {
        console.error("Error signing up:", error);
        showError(error.message);
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
        console.log("User logged in.");
    } catch (error) {
        console.error("Error logging in:", error);
        showError(error.message);
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
        console.log("User logged out.");
    } catch (error) {
        console.error("Error logging out:", error);
        showError(error.message);
    }
});

// --- Mobile Sidebar Toggle ---
menuButton.addEventListener('click', () => {
    sidebar.classList.add('open');
    const backdrop = document.createElement('div');
    backdrop.classList.add('sidebar-backdrop');
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        document.body.removeChild(backdrop);
    });
});


// --- Initial Setup ---
messageInput.focus();
adjustTextareaHeight();
console.log("Kramer Intelligence script initialized.");
// --- END Initial Setup ---