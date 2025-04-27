// public/script.js

// DOM element references
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input'); // Textarea
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
const IMAGE_CHAR_EQUIVALENT = 1000; // Estimated char count for history truncation
const MAX_IMAGE_SIZE_MB = 15;
// --- End Configuration ---

// --- State Variables ---
let conversationHistory = [];
let selectedFile = null; // Holds the File object
let selectedFileBase64 = null; // Holds the DataURL string
// --- End State Variables ---

// --- Event Listeners ---
messageInput.addEventListener('keydown', handleInputKeyDown); // For Enter/Shift+Enter
sendButton.addEventListener('click', handleSendButtonClick); // For button click
attachButton.addEventListener('click', () => {
    resetFileInput();
    imageUploadInput.click();
});
imageUploadInput.addEventListener('change', handleFileSelect);
removeImageButton.addEventListener('click', handleRemoveImage);
document.addEventListener('paste', handlePaste); // For pasting images
messageInput.addEventListener('input', adjustTextareaHeight); // For dynamic height
// --- END Event Listeners ---


// --- Functions ---

// --- Function to dynamically adjust textarea height ---
function adjustTextareaHeight() {
    // Reset height temporarily to accurately measure scrollHeight
    messageInput.style.height = 'auto';
    // Set height to scrollHeight, respecting CSS max-height
    messageInput.style.height = `${messageInput.scrollHeight}px`;
    // console.log(`Adjusted textarea height to: ${messageInput.style.height}`); // Optional logging
}

// --- Handler for Keydown Events on Input ---
function handleInputKeyDown(event) {
    if (event.key === 'Enter') {
        if (event.shiftKey) {
            // Shift+Enter: Allow default newline insertion.
            // Height adjustment is handled by the 'input' event listener.
            console.log("Shift+Enter detected - Allowing newline.");
        } else {
            // Enter alone: Prevent default newline and send message.
            console.log("Enter alone detected - Preventing newline, triggering send.");
            event.preventDefault();
            handleSendMessage();
        }
    }
}

// --- Handler for Send Button Click ---
function handleSendButtonClick() {
    console.log("Send button clicked - triggering send.");
    handleSendMessage();
}

// --- Refactored File Processing Logic ---
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
        console.log("Image processed:", file.name);
    };
    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading the image file.");
        handleRemoveImage();
    };
    reader.readAsDataURL(file);
    return true;
}

// --- Handle File Selection via Input ---
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const processed = processSelectedFile(file);
    if (!processed) {
        resetFileInput();
    }
}

// --- Paste Handler (Checks for Focus) ---
function handlePaste(event) {
    if (document.activeElement !== messageInput) { return; } // Only handle paste if input is focused
    const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
    if (!items) { return; }
    let foundImage = false;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const imageFile = item.getAsFile();
            if (imageFile) {
                const processed = processSelectedFile(imageFile);
                if (processed) {
                    foundImage = true;
                    event.preventDefault(); // Prevent pasting file path as text
                    console.log("Image paste handled, default paste prevented.");
                    break; // Handle only first image
                }
            }
        }
    }
    // Let text paste trigger 'input' event naturally for resize
}

// --- Handle Manual Removal of Image ---
function handleRemoveImage() {
    selectedFile = null;
    selectedFileBase64 = null;
    imagePreview.src = '#';
    imagePreviewContainer.classList.add('hidden');
    resetFileInput();
    attachButton.classList.remove('has-file');
    hideError(); // Hide errors when image is removed
    console.log("Selected image removed.");
}

// --- Utility to Reset File Input ---
function resetFileInput() {
    imageUploadInput.value = null;
}

// --- Handle Sending Message (Text and/or Image) ---
async function handleSendMessage() {
    const userMessageText = messageInput.value.trim();
    if (!userMessageText && !selectedFileBase64) {
        console.log("Send ignored: No text or image.");
        return;
    }

    sendButton.disabled = true;
    hideError();
    showLoading();

    const messageParts = [];
    let currentImageDataUrl = null; // For local display
    if (selectedFileBase64 && selectedFile) {
        messageParts.push({ inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 } });
        currentImageDataUrl = selectedFileBase64;
    }
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
    }

    displayMessage('user', userMessageText || '', currentImageDataUrl);
    scrollChatToBottom();

    conversationHistory.push({ role: 'user', parts: messageParts });

    // Clear input and reset image state AFTER sending
    messageInput.value = '';
    handleRemoveImage(); // Resets image selection

    // Reset textarea height AFTER clearing value
    adjustTextareaHeight();

    messageInput.focus();

    // --- API Call Section ---
    try {
        truncateHistory();
        const historyForThisRequest = [...conversationHistory];
        const payload = { history: historyForThisRequest };
        // console.log("Sending payload to /api/chat:", JSON.stringify(payload).substring(0, 500) + '...'); // Log less

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
            } catch (e) { console.warn("Could not parse API error response."); }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml;
        const modelUsed = data.modelUsed;

        console.log(`AI Response received (using ${modelUsed || 'model'})`);

        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });

        displayMessage('ai', aiResponseText, null, searchSuggestionHtml);
        scrollChatToBottom();

    } catch (err) {
        console.error("Error during send/receive:", err);
        showError(err.message || "Failed to get response from AI.");
        hideLoading();
    } finally {
        sendButton.disabled = false;
    }
    // --- END API Call Section ---
}

// --- Display Message in Chat History ---
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
                console.error("Markdown processing error:", error);
                paragraph.textContent = text; // Fallback
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
            console.warn("DOMPurify not loaded. Search suggestions HTML not displayed.");
        }
        // Append only if content exists after sanitization (or if Purify missing)
        if (suggestionContainer.innerHTML) {
           messageDiv.appendChild(suggestionContainer);
        }
    }

    chatHistory.appendChild(messageDiv);
}

// --- Truncate History if it Exceeds Limit ---
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
    // console.log(`History size: ~${totalChars} chars`);
    while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length >= 2) {
        console.log(`History limit exceeded (${totalChars}/${MAX_HISTORY_CHARS}). Truncating.`);
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
        console.log(`Removed pair. New count: ~${totalChars}`);
    }
}

// --- UI Utility Functions ---
function scrollChatToBottom() {
    setTimeout(() => {
        const chatContainer = document.getElementById('chat-container');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50); // Small delay helps ensure DOM is updated
}
function showLoading() { loadingIndicator.classList.remove('hidden'); }
function hideLoading() { loadingIndicator.classList.add('hidden'); }
function showError(message) {
    errorDisplay.textContent = message;
    errorDisplay.classList.remove('hidden');
    console.error("Displaying error:", message);
}
function hideError() {
    errorDisplay.classList.add('hidden');
    errorDisplay.textContent = '';
}

// --- Initial Setup ---
messageInput.focus();
adjustTextareaHeight(); // Set initial height correctly
console.log("Kramer Intelligence script initialized.");
// --- END Initial Setup ---