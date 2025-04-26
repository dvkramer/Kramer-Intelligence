// Existing DOM element references
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatHistory = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading');
const errorDisplay = document.getElementById('error');

// Elements for image handling
const attachButton = document.getElementById('attach-button');
const imageUploadInput = document.getElementById('image-upload-input');
// --- RE-ADDED: Elements for separate image preview banner ---
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageButton = document.getElementById('remove-image-button');
// --- END RE-ADDED ---

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
chatForm.addEventListener('submit', handleSendMessage);

// Listeners for image handling
attachButton.addEventListener('click', () => {
    resetFileInput();
    imageUploadInput.click();
});

imageUploadInput.addEventListener('change', handleFileSelect);

// --- RE-ADDED: Listener for remove button ---
removeImageButton.addEventListener('click', handleRemoveImage);
// --- END RE-ADDED ---


// --- Functions ---

// Image Handling Functions
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showError('Please select an image file.');
        resetFileInput();
        return;
    }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        showError(`Image size should not exceed ${MAX_IMAGE_SIZE_MB} MB.`);
        resetFileInput();
        return;
    }

    selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        selectedFileBase64 = e.target.result;
        // --- RE-ADDED: Logic to show separate preview banner ---
        imagePreview.src = selectedFileBase64;
        imagePreviewContainer.classList.remove('hidden');
        // --- END RE-ADDED ---
        hideError();
        attachButton.classList.add('has-file'); // Add class to change style
    };
    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading file.");
        handleRemoveImage(); // Use the full remove handler
    };
    reader.readAsDataURL(file);
}

// --- RENAMED back to handleRemoveImage and RE-ADD logic ---
function handleRemoveImage() { // Renamed back
    selectedFile = null;
    selectedFileBase64 = null;
    // --- RE-ADDED: Logic to hide separate preview banner ---
    imagePreview.src = '#'; // Clear preview src
    imagePreviewContainer.classList.add('hidden');
    // --- END RE-ADDED ---
    resetFileInput();
    attachButton.classList.remove('has-file'); // Remove class
}
// --- END RENAMED/RE-ADD ---

function resetFileInput() {
    imageUploadInput.value = null;
}


async function handleSendMessage(event) {
    event.preventDefault();
    const userMessageText = messageInput.value.trim();
    if (!userMessageText && !selectedFileBase64) { return; }

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
    }
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
    }

    displayMessage('user', userMessageText || '', currentImageDataUrl);
    scrollChatToBottom();

    conversationHistory.push({ role: 'user', parts: messageParts });

    messageInput.value = '';
    handleRemoveImage(); // Use the restored function to clear state AND preview

    messageInput.focus();

    try {
        truncateHistory();
        const historyForThisRequest = [...conversationHistory];
        const payload = { history: historyForThisRequest };

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        hideLoading();

        if (!response.ok) {
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; }
            catch (e) { /* Ignore */ }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml;

        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });
        displayMessage('ai', aiResponseText, null, searchSuggestionHtml);
        scrollChatToBottom();

    } catch (err) {
        console.error("Error fetching AI response:", err);
        showError(err.message || "Failed to get response from AI. Please try again.");
        hideLoading();
    } finally {
        sendButton.disabled = false;
    }
}

// displayMessage remains the same as the previous version (already handles image display in bubble)
function displayMessage(role, text, imageDataUrl = null, searchSuggestionHtml = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    if (imageDataUrl) {
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
        suggestionContainer.innerHTML = searchSuggestionHtml;
        messageDiv.appendChild(suggestionContainer);
    }

    chatHistory.appendChild(messageDiv);
}


// truncateHistory remains the same
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
    while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length >= 2) {
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
        console.log("Truncated history. New char count:", totalChars);
    }
}

// scrollChatToBottom, showLoading, hideLoading, showError, hideError remain the same
function scrollChatToBottom() { setTimeout(() => { const chatContainer = document.getElementById('chat-container'); chatContainer.scrollTop = chatContainer.scrollHeight; }, 0); }
function showLoading() { loadingIndicator.classList.remove('hidden'); }
function hideLoading() { loadingIndicator.classList.add('hidden'); }
function showError(message) { errorDisplay.textContent = message; errorDisplay.classList.remove('hidden'); setTimeout(hideError, 5000); }
function hideError() { errorDisplay.classList.add('hidden'); errorDisplay.textContent = ''; }

// --- Initial Setup ---
messageInput.focus();