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
const mainContentArea = document.getElementById('main-content-area'); // Scrolling container

// --- Configuration ---
const MAX_HISTORY_CHARS = 1000000;
const IMAGE_CHAR_EQUIVALENT = 1000;
const MAX_IMAGE_SIZE_MB = 15;
const SCROLL_PADDING_TOP = 10; // Pixels above the message top when scrolling
// --- End Configuration ---

// --- State Variables ---
let conversationHistory = [];
let selectedFile = null;
let selectedFileBase64 = null;
// --- End State Variables ---

// --- Event Listeners ---
messageInput.addEventListener('keydown', handleInputKeyDown);
sendButton.addEventListener('click', handleSendButtonClick);
attachButton.addEventListener('click', () => {
    resetFileInput();
    imageUploadInput.click();
});
imageUploadInput.addEventListener('change', handleFileSelect);
removeImageButton.addEventListener('click', handleRemoveImage);
document.addEventListener('paste', handlePaste);
messageInput.addEventListener('input', adjustTextareaHeight);
// --- END Event Listeners ---


// --- Functions ---

// --- Function to dynamically adjust textarea height ---
function adjustTextareaHeight() {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${messageInput.scrollHeight}px`;
}

// --- Standard scroll to bottom (for user messages) ---
function scrollChatToBottom() {
    setTimeout(() => {
        mainContentArea.scrollTop = mainContentArea.scrollHeight;
    }, 50);
}

// --- Smart scroll for AI messages (REVISED - Always Scrolls) ---
function scrollToMessageTop(messageElement) {
    setTimeout(() => {
        // Calculate the position of the message top relative to the scroll container's content
        const messageTopOffset = messageElement.offsetTop;

        // Calculate the desired scroll position to bring the message top near the view top
        let desiredScrollTop = messageTopOffset - SCROLL_PADDING_TOP;

        // Ensure we don't scroll past the beginning
        desiredScrollTop = Math.max(0, desiredScrollTop);

        // ALWAYS attempt the smooth scroll
        console.log(`Smart scrolling AI message to scrollTop: ${desiredScrollTop}`);
        mainContentArea.scrollTo({
            top: desiredScrollTop,
            behavior: 'smooth' // Use smooth scrolling
        });

    }, 100); // Delay helps ensure offsetTop is calculated correctly after render
}
// --- END REVISED ---


function handleInputKeyDown(event) {
    if (event.key === 'Enter') {
        if (event.shiftKey) { /* Allow newline */ }
        else { event.preventDefault(); handleSendMessage(); }
    }
}

function handleSendButtonClick() { handleSendMessage(); }


function processSelectedFile(file) {
    if (!file) return false;
    if (!file.type.startsWith('image/')) {
        showError('Pasted/Selected item is not a valid image file.'); handleRemoveImage(); return false; }
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        showError(`Image size should not exceed ${MAX_IMAGE_SIZE_MB} MB.`); handleRemoveImage(); return false; }
    hideError();
    const reader = new FileReader();
    reader.onload = (e) => {
        selectedFileBase64 = e.target.result; selectedFile = file;
        imagePreview.src = selectedFileBase64; imagePreviewContainer.classList.remove('hidden');
        attachButton.classList.add('has-file'); console.log("Image processed:", file.name); };
    reader.onerror = (e) => { console.error("FileReader error:", e); showError("Error reading image file."); handleRemoveImage(); };
    reader.readAsDataURL(file); return true;
 }
function handleFileSelect(event) {
    const file = event.target.files[0]; if (!file) return;
    const processed = processSelectedFile(file); if (!processed) { resetFileInput(); } }
function handlePaste(event) {
    if (document.activeElement !== messageInput) { return; } const items = (event.clipboardData || event.originalEvent.clipboardData)?.items; if (!items) { return; } let foundImage = false; for (let i = 0; i < items.length; i++) { const item = items[i]; if (item.kind === 'file' && item.type.startsWith('image/')) { const imageFile = item.getAsFile(); if (imageFile) { const processed = processSelectedFile(imageFile); if (processed) { foundImage = true; event.preventDefault(); console.log("Image paste handled."); break; } } } } }
function handleRemoveImage() {
    selectedFile = null; selectedFileBase64 = null; imagePreview.src = '#';
    imagePreviewContainer.classList.add('hidden'); resetFileInput();
    attachButton.classList.remove('has-file'); hideError(); console.log("Selected image removed."); }
function resetFileInput() { imageUploadInput.value = null; }


async function handleSendMessage() {
    const userMessageText = messageInput.value.trim();
    if (!userMessageText && !selectedFileBase64) { return; }

    sendButton.disabled = true; hideError(); showLoading();

    const messageParts = []; let currentImageDataUrl = null;
    if (selectedFileBase64 && selectedFile) {
        messageParts.push({ inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 } });
        currentImageDataUrl = selectedFileBase64; }
    if (userMessageText) { messageParts.push({ text: userMessageText }); }

    // displayMessage handles scrolling based on role now
    displayMessage('user', userMessageText || '', currentImageDataUrl);

    conversationHistory.push({ role: 'user', parts: messageParts });
    messageInput.value = ''; handleRemoveImage(); adjustTextareaHeight(); messageInput.focus();

    // --- API Call Section ---
    try {
        truncateHistory();
        const historyForThisRequest = [...conversationHistory];
        const payload = { history: historyForThisRequest };

        const response = await fetch('/api/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), });
        hideLoading();

        if (!response.ok) { let errorMsg = `API Error: ${response.statusText} (${response.status})`; try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch (e) { console.warn("Could not parse API error."); } throw new Error(errorMsg); }

        const data = await response.json();
        const aiResponseText = data.text; const searchSuggestionHtml = data.searchSuggestionHtml; const modelUsed = data.modelUsed;
        console.log(`AI Response received (using ${modelUsed || 'model'})`);

        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });

        // displayMessage handles scrolling based on role now
        displayMessage('ai', aiResponseText, null, searchSuggestionHtml);

    } catch (err) { console.error("Error during send/receive:", err); showError(err.message || "Failed to get response."); hideLoading();
    } finally { sendButton.disabled = false; }
    // --- END API Call Section ---
}


// --- Display Message and Trigger Appropriate Scroll ---
function displayMessage(role, text, imageDataUrl = null, searchSuggestionHtml = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    // Add image if present
    if (imageDataUrl && role === 'user') {
        const imgElement = document.createElement('img');
        imgElement.classList.add('message-image'); imgElement.src = imageDataUrl; imgElement.alt = "User uploaded image";
        messageDiv.appendChild(imgElement); }
    // Add text if present
    if (text) {
        const paragraph = document.createElement('p');
        if (role === 'ai' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                marked.setOptions({ breaks: true, gfm: true }); const rawHtml = marked.parse(text);
                const sanitizedHtml = DOMPurify.sanitize(rawHtml); paragraph.innerHTML = sanitizedHtml;
            } catch (error) { console.error("Markdown error:", error); paragraph.textContent = text; }
        } else { paragraph.textContent = text; }
        messageDiv.appendChild(paragraph); }
    // Add search suggestions if present
    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container');
        if (typeof DOMPurify !== 'undefined') { suggestionContainer.innerHTML = DOMPurify.sanitize(searchSuggestionHtml); }
        else { console.warn("DOMPurify not loaded."); }
        if (suggestionContainer.innerHTML) { messageDiv.appendChild(suggestionContainer); } }

    // Append the message to the history
    chatHistory.appendChild(messageDiv);

    // Trigger scroll based on role
    if (role === 'user') {
        scrollChatToBottom(); // Scroll fully down for user's messages
    } else if (role === 'ai') {
        scrollToMessageTop(messageDiv); // Use the smart scroll for AI messages
    }
}


function truncateHistory() {
    let totalChars = 0; for (const message of conversationHistory) { if (message.parts && Array.isArray(message.parts)) { for (const part of message.parts) { if (part.text) { totalChars += part.text.length; } else if (part.inlineData) { totalChars += IMAGE_CHAR_EQUIVALENT; } } } }
    while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length >= 2) { /* console.log(`History limit exceeded. Truncating.`); */ const removedUserMsg = conversationHistory.shift(); const removedModelMsg = conversationHistory.shift(); let removedChars = 0; [removedUserMsg, removedModelMsg].forEach(msg => { if (msg?.parts && Array.isArray(msg.parts)) { msg.parts.forEach(part => { if (part.text) removedChars += part.text.length; else if (part.inlineData) removedChars += IMAGE_CHAR_EQUIVALENT; }); } }); totalChars -= removedChars; } }


function showLoading() { loadingIndicator.classList.remove('hidden'); }
function hideLoading() { loadingIndicator.classList.add('hidden'); }
function showError(message) { errorDisplay.textContent = message; errorDisplay.classList.remove('hidden'); console.error("Displaying error:", message); }
function hideError() { errorDisplay.classList.add('hidden'); errorDisplay.textContent = ''; }


// --- Initial Setup ---
messageInput.focus();
adjustTextareaHeight(); // Set initial height
console.log("Kramer Intelligence script initialized.");
// --- END Initial Setup ---