// public/script.js

// DOM element references
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input'); // Now refers to the <textarea>
const sendButton = document.getElementById('send-button');
const chatHistory = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading');
const errorDisplay = document.getElementById('error');
const attachButton = document.getElementById('attach-button');
const imageUploadInput = document.getElementById('image-upload-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageButton = document.getElementById('remove-image-button');

// --- Configuration ---
const MAX_HISTORY_CHARS = 1000000;
const IMAGE_CHAR_EQUIVALENT = 1000;
const MAX_IMAGE_SIZE_MB = 15;
// --- End Configuration ---

// --- State Variables ---
let conversationHistory = [];
let selectedFile = null;
let selectedFileBase64 = null;
// --- End State Variables ---

// --- Event Listeners ---

// --- REMOVED: Form submit listener is no longer the primary trigger ---
// chatForm.addEventListener('submit', handleSendMessage);

// --- ADDED: Keydown listener on the textarea ---
messageInput.addEventListener('keydown', handleInputKeyDown);

// --- ADDED: Click listener for the send button ---
// We still need the button to work independently
sendButton.addEventListener('click', handleSendButtonClick);

// Listeners for image handling (remain the same)
attachButton.addEventListener('click', () => {
    resetFileInput();
    imageUploadInput.click();
});
imageUploadInput.addEventListener('change', handleFileSelect);
removeImageButton.addEventListener('click', handleRemoveImage);
document.addEventListener('paste', handlePaste);
// --- END Event Listeners ---


// --- Functions ---

// --- NEW: Handler for Keydown Events on Input ---
function handleInputKeyDown(event) {
    // Check if Enter key was pressed
    if (event.key === 'Enter') {
        if (event.shiftKey) {
            // Shift + Enter: Allow default behavior (insert newline)
            console.log("Shift+Enter detected - inserting newline.");
            // Optionally, you might want to slightly increase the textarea height here
            // adjustTextareaHeight(); // Example call to a potential helper function
        } else {
            // Enter alone: Prevent default (newline insertion) and send message
            console.log("Enter detected - sending message.");
            event.preventDefault(); // Prevent newline
            handleSendMessage(); // Call the send logic
        }
    }
}
// --- END NEW ---

// --- NEW: Handler for Send Button Click ---
function handleSendButtonClick() {
    console.log("Send button clicked.");
    handleSendMessage(); // Call the same send logic
}
// --- END NEW ---


// --- Refactored File Processing Logic (remains the same) ---
function processSelectedFile(file) {
    if (!file) return false;
    if (!file.type.startsWith('image/')) {
        showError('Pasted/Selected item is not a valid image file.');
        handleRemoveImage();
        return false;
    }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        showError(`Image size should not exceed ${MAX_IMAGE_SIZE_MB} MB.`);
        handleRemoveImage();
        return false;
    }
    hideError();
    const reader = new FileReader();
    reader.onload = (e) => {
        selectedFileBase64 = e.target.result;
        selectedFile = file;
        imagePreview.src = selectedFileBase64;
        imagePreviewContainer.classList.remove('hidden');
        attachButton.classList.add('has-file');
        console.log("Image processed successfully:", file.name, file.type);
    };
    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading the image file.");
        handleRemoveImage();
    };
    reader.readAsDataURL(file);
    return true;
}
// --- END Refactored File Processing Logic ---

// --- Handle File Selection via Input (remains the same) ---
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const processed = processSelectedFile(file);
    if (!processed) {
        resetFileInput();
    }
}
// --- END Handle File Selection via Input ---

// --- Paste Handler (Checks for Focus - remains the same logic) ---
function handlePaste(event) {
    if (document.activeElement !== messageInput) {
        console.log("Paste event ignored: Message input does not have focus.");
        return;
    }
    const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
    if (!items) {
        console.log("Paste event ignored: No clipboard items found.");
        return;
    }
    console.log("Paste event detected while input focused.");
    let foundImage = false;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const imageFile = item.getAsFile();
            if (imageFile) {
                console.log("Image file found in clipboard:", imageFile.name, imageFile.type);
                const processed = processSelectedFile(imageFile);
                if (processed) {
                    foundImage = true;
                    event.preventDefault(); // Prevent default ONLY if image processed
                    console.log("Image paste handled, default paste prevented.");
                    break;
                } else {
                    console.log("Image processing failed (validation or reader error).");
                }
            }
        }
    }
    if (!foundImage) {
        console.log("Paste event did not contain a handleable image file, allowing default paste behavior.");
    }
}
// --- END Paste Handler ---

// --- Handle Manual Removal of Image (remains the same) ---
function handleRemoveImage() {
    selectedFile = null;
    selectedFileBase64 = null;
    imagePreview.src = '#';
    imagePreviewContainer.classList.add('hidden');
    resetFileInput();
    attachButton.classList.remove('has-file');
    hideError();
    console.log("Selected image removed and state reset.");
}
// --- END Handle Manual Removal of Image ---

// --- Utility to Reset File Input (remains the same) ---
function resetFileInput() {
    imageUploadInput.value = null;
}
// --- END Utility to Reset File Input ---

// --- Handle Sending Message (MODIFIED: No longer receives event) ---
async function handleSendMessage() {
    // event.preventDefault(); // REMOVED - Not called by submit event anymore

    const userMessageText = messageInput.value.trim();

    if (!userMessageText && !selectedFileBase64) {
        console.log("Send ignored: No text or image selected.");
        return;
    }

    sendButton.disabled = true;
    hideError();
    showLoading();

    const messageParts = [];
    let currentImageDataUrl = null;

    if (selectedFileBase64 && selectedFile) {
        messageParts.push({
            inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 }
        });
        currentImageDataUrl = selectedFileBase64;
        console.log("Adding image part to request:", selectedFile.name);
    }

    if (userMessageText) {
        messageParts.push({ text: userMessageText });
        console.log("Adding text part to request:", userMessageText);
    }

    // Display user message BEFORE clearing inputs
    displayMessage('user', userMessageText || '', currentImageDataUrl);
    scrollChatToBottom(); // Scroll after adding the message

    // Add to internal history
    conversationHistory.push({ role: 'user', parts: messageParts });

    // Clear inputs and reset image state
    messageInput.value = ''; // Clear the textarea
    handleRemoveImage(); // Resets image state, preview, etc.
    // Optional: Reset textarea height if you implemented auto-resizing
    // resetTextareaHeight();

    messageInput.focus();

    // --- API Call Section (logic remains the same) ---
    try {
        truncateHistory();
        const historyForThisRequest = [...conversationHistory];
        const payload = { history: historyForThisRequest };
        console.log("Sending payload to /api/chat:", JSON.stringify(payload, (key, value) => key === 'data' && typeof value === 'string' && value.length > 100 ? value.substring(0, 100) + '...' : value , 2));

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        hideLoading();

        if (!response.ok) {
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                console.warn("Could not parse error JSON from API response.");
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml;
        const modelUsed = data.modelUsed;

        console.log(`AI Response received (using ${modelUsed || 'unknown model'}):`, aiResponseText?.substring(0, 100) + "...");
        if(searchSuggestionHtml) console.log("Search suggestion HTML present.");

        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });

        displayMessage('ai', aiResponseText, null, searchSuggestionHtml);
        scrollChatToBottom();

    } catch (err) {
        console.error("Error during send/receive:", err);
        showError(err.message || "Failed to get response from AI. Please try again.");
        hideLoading();
    } finally {
        sendButton.disabled = false;
    }
    // --- END API Call Section ---
}
// --- END Handle Sending Message ---

// --- Display Message in Chat History (remains the same) ---
function displayMessage(role, text, imageDataUrl = null, searchSuggestionHtml = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    if (imageDataUrl && role === 'user') {
        const imgElement = document.createElement('img');
        imgElement.classList.add('message-image');
        imgElement.src = imageDataUrl;
        imgElement.alt = "User uploaded image";
        messageDiv.appendChild(imgElement);
    }

    if (text) {
        const paragraph = document.createElement('p');
        if (role === 'ai' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                marked.setOptions({ breaks: true, gfm: true });
                const rawHtml = marked.parse(text);
                const sanitizedHtml = DOMPurify.sanitize(rawHtml);
                paragraph.innerHTML = sanitizedHtml;
            } catch (error) {
                console.error("Error parsing or sanitizing Markdown:", error);
                paragraph.textContent = text;
            }
        } else {
            paragraph.textContent = text;
        }
        messageDiv.appendChild(paragraph);
    }

    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container');
        if (typeof DOMPurify !== 'undefined') {
            suggestionContainer.innerHTML = DOMPurify.sanitize(searchSuggestionHtml);
        } else {
            console.warn("DOMPurify not loaded. Cannot safely display search suggestions HTML.");
            // suggestionContainer.innerHTML = "<!-- Search suggestions omitted for security -->";
        }
        if (suggestionContainer.innerHTML) {
           messageDiv.appendChild(suggestionContainer);
        }
    }

    chatHistory.appendChild(messageDiv);
}
// --- END Display Message in Chat History ---

// --- Truncate History (remains the same) ---
function truncateHistory() {
    let totalChars = 0;
    for (const message of conversationHistory) {
        if (message.parts && Array.isArray(message.parts)) {
            for (const part of message.parts) {
                if (part.text) { totalChars += part.text.length; }
                else if (part.inlineData) { totalChars += IMAGE_CHAR_EQUIVALENT; }
            }
        }
    }
     console.log(`Current history size: ~${totalChars} estimated chars (Limit: ${MAX_HISTORY_CHARS})`);

    while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length >= 2) {
        console.log(`History limit exceeded (${totalChars}/${MAX_HISTORY_CHARS}). Truncating oldest pair...`);
        const removedUserMsg = conversationHistory.shift();
        const removedModelMsg = conversationHistory.shift();
        let removedChars = 0;
        [removedUserMsg, removedModelMsg].forEach(msg => {
             if (msg?.parts && Array.isArray(msg.parts)) {
                msg.parts.forEach(part => {
                    if (part.text) removedChars += part.text.length;
                    else if (part.inlineData) removedChars += IMAGE_CHAR_EQUIVALENT;
                });
            }
        });
        totalChars -= removedChars;
        console.log(`Removed oldest pair (estimated ${removedChars} chars). New char count: ~${totalChars}`);
    }
}
// --- END Truncate History ---

// --- UI Utility Functions (remain the same) ---
function scrollChatToBottom() {
    setTimeout(() => {
        const chatContainer = document.getElementById('chat-container');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50);
}

function showLoading() {
    loadingIndicator.classList.remove('hidden');
}

function hideLoading() {
    loadingIndicator.classList.add('hidden');
}

function showError(message) {
    errorDisplay.textContent = message;
    errorDisplay.classList.remove('hidden');
    console.error("Displaying error to user:", message);
}

function hideError() {
    errorDisplay.classList.add('hidden');
    errorDisplay.textContent = '';
}
// --- END UI Utility Functions ---


// --- Initial Setup ---
messageInput.focus();
console.log("Kramer Intelligence script initialized successfully.");
// --- END Initial Setup ---