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
const SCROLL_PADDING_TOP = 10; // Pixels above the AI message top when scrolling
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

// --- Textarea Height Adjustment ---
function adjustTextareaHeight() {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${messageInput.scrollHeight}px`;
}

// --- Scrolling Functions ---
// Scrolls fully to the bottom (smoothly) - Used for user messages
function scrollChatToBottom() {
    // Use rAF for consistency, though less critical here as scrollHeight is simpler
    requestAnimationFrame(() => {
        mainContentArea.scrollTo({
            top: mainContentArea.scrollHeight,
            behavior: 'smooth'
        });
    });
    // Using setTimeout is also fine here if preferred:
    // setTimeout(() => {
    //     mainContentArea.scrollTo({
    //         top: mainContentArea.scrollHeight,
    //         behavior: 'smooth'
    //     });
    // }, 50);
}

// Scrolls smoothly to the top of a new AI message using requestAnimationFrame
function scrollToMessageTop(messageElement) {
    // --- MODIFIED: Use double requestAnimationFrame ---
    requestAnimationFrame(() => { // Wait for frame 1 (after DOM mutation likely processed)
        requestAnimationFrame(() => { // Wait for frame 2 (layout calculations should be stable)
            const messageTopOffset = messageElement.offsetTop;
            let desiredScrollTop = messageTopOffset - SCROLL_PADDING_TOP;
            desiredScrollTop = Math.max(0, desiredScrollTop); // Don't scroll negative

            // console.log(`rAF - Scrolling AI message to scrollTop: ${desiredScrollTop}`);
            mainContentArea.scrollTo({
                top: desiredScrollTop,
                behavior: 'smooth'
            });
        });
    });
    // --- END MODIFIED ---
}
// --- END Scrolling Functions ---

// --- Input Handling ---
// Handles keydown events in the textarea (Enter vs Shift+Enter)
function handleInputKeyDown(event) {
    if (event.key === 'Enter') {
        if (event.shiftKey) { /* Allow newline */ }
        else { event.preventDefault(); handleSendMessage(); }
    }
}

// Handles clicks on the explicit Send button
function handleSendButtonClick() { handleSendMessage(); }
// --- END Input Handling ---

// --- Image Handling Functions ---
// Processes a selected file (from input or paste)
function processSelectedFile(file) { if (!file) return false; if (!file.type.startsWith('image/')) { showError('Invalid image file.'); handleRemoveImage(); return false; } if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) { showError(`Image > ${MAX_IMAGE_SIZE_MB} MB.`); handleRemoveImage(); return false; } hideError(); const reader = new FileReader(); reader.onload = (e) => { selectedFileBase64 = e.target.result; selectedFile = file; imagePreview.src = selectedFileBase64; imagePreviewContainer.classList.remove('hidden'); attachButton.classList.add('has-file'); console.log("Image processed:", file.name); }; reader.onerror = (e) => { console.error("FileReader error:", e); showError("Error reading image."); handleRemoveImage(); }; reader.readAsDataURL(file); return true; }

// Handles file selection via the file input element
function handleFileSelect(event) { const file = event.target.files[0]; if (!file) return; const processed = processSelectedFile(file); if (!processed) { resetFileInput(); } }

// Handles paste events (for images, when input is focused)
function handlePaste(event) { if (document.activeElement !== messageInput) { return; } const items = (event.clipboardData || event.originalEvent.clipboardData)?.items; if (!items) { return; } let foundImage = false; for (let i = 0; i < items.length; i++) { const item = items[i]; if (item.kind === 'file' && item.type.startsWith('image/')) { const imageFile = item.getAsFile(); if (imageFile) { const processed = processSelectedFile(imageFile); if (processed) { foundImage = true; event.preventDefault(); console.log("Image paste handled."); break; } } } } }

// Handles click on the remove image button or clears image state programmatically
function handleRemoveImage() { selectedFile = null; selectedFileBase64 = null; imagePreview.src = '#'; imagePreviewContainer.classList.add('hidden'); resetFileInput(); attachButton.classList.remove('has-file'); hideError(); console.log("Selected image removed."); }

// Resets the value of the hidden file input
function resetFileInput() { imageUploadInput.value = null; }
// --- END Image Handling Functions ---


// --- Core Message Sending Logic ---
async function handleSendMessage() {
    const userMessageText = messageInput.value.trim();
    if (!userMessageText && !selectedFileBase64) { return; }

    sendButton.disabled = true; hideError(); showLoading();

    const messageParts = []; let currentImageDataUrl = null;
    if (selectedFileBase64 && selectedFile) { messageParts.push({ inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 } }); currentImageDataUrl = selectedFileBase64; }
    if (userMessageText) { messageParts.push({ text: userMessageText }); }

    displayMessage('user', userMessageText || '', currentImageDataUrl); // Handles scroll

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

        displayMessage('ai', aiResponseText, null, searchSuggestionHtml); // Handles scroll

    } catch (err) { console.error("Error during send/receive:", err); showError(err.message || "Failed to get response."); hideLoading();
    } finally { sendButton.disabled = false; }
    // --- END API Call Section ---
}
// --- END Core Message Sending Logic ---


// --- Display & Formatting ---
// Displays a message bubble in the chat history
function displayMessage(role, text, imageDataUrl = null, searchSuggestionHtml = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    // Add image element if provided (for user messages)
    if (imageDataUrl && role === 'user') {
        const imgElement = document.createElement('img');
        imgElement.classList.add('message-image'); imgElement.src = imageDataUrl; imgElement.alt = "User uploaded image";
        messageDiv.appendChild(imgElement);
    }

    // Add text element if provided
    if (text) {
        const paragraph = document.createElement('p');
        // Process AI text with Markdown & Sanitize (but NOT Google Search HTML)
        if (role === 'ai' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                marked.setOptions({ breaks: true, gfm: true });
                const rawHtml = marked.parse(text);
                // Sanitize the AI's generated Markdown output
                const sanitizedHtml = DOMPurify.sanitize(rawHtml);
                paragraph.innerHTML = sanitizedHtml;
            } catch (error) { console.error("Markdown processing error:", error); paragraph.textContent = text; }
        } else { paragraph.textContent = text; } // User text or AI text if libs are missing
        if (paragraph.innerHTML || paragraph.textContent) { messageDiv.appendChild(paragraph); }
    }

    // Add Google Search suggestions if provided - Inject Directly
    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container'); // Only for margin

        try {
            // Directly inject Google's HTML without sanitization per their requirements
            suggestionContainer.innerHTML = searchSuggestionHtml;
            // console.log("Directly appended search suggestions HTML.");

            // Append container only if it's not empty after assignment
            if (suggestionContainer.innerHTML.trim()) { messageDiv.appendChild(suggestionContainer); }
            // else { console.log("Google Search suggestion HTML was empty."); }
        } catch (error) { console.error("Error setting innerHTML for search suggestions:", error); }
    }

    // Add the fully constructed message bubble to the chat history UI
    chatHistory.appendChild(messageDiv);

    // Trigger the appropriate scrolling behavior
    if (role === 'user') { scrollChatToBottom(); } // Smooth scroll fully down for user
    else if (role === 'ai') { scrollToMessageTop(messageDiv); } // Smooth scroll to top of AI message
}
// --- END Display & Formatting ---

// --- History Management ---
// Truncates the conversation history if it exceeds the character limit
function truncateHistory() { let totalChars = 0; for (const message of conversationHistory) { if (message.parts && Array.isArray(message.parts)) { for (const part of message.parts) { if (part.text) { totalChars += part.text.length; } else if (part.inlineData) { totalChars += IMAGE_CHAR_EQUIVALENT; } } } } while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length >= 2) { /* console.log(`History limit exceeded. Truncating.`); */ const removedUserMsg = conversationHistory.shift(); const removedModelMsg = conversationHistory.shift(); let removedChars = 0; [removedUserMsg, removedModelMsg].forEach(msg => { if (msg?.parts && Array.isArray(msg.parts)) { msg.parts.forEach(part => { if (part.text) removedChars += part.text.length; else if (part.inlineData) removedChars += IMAGE_CHAR_EQUIVALENT; }); } }); totalChars -= removedChars; } }
// --- END History Management ---

// --- UI Utility Functions ---
function showLoading() { loadingIndicator.classList.remove('hidden'); }
function hideLoading() { loadingIndicator.classList.add('hidden'); }
function showError(message) { errorDisplay.textContent = message; errorDisplay.classList.remove('hidden'); console.error("Displaying error:", message); }
function hideError() { errorDisplay.classList.add('hidden'); errorDisplay.textContent = ''; }
// --- END UI Utility Functions ---


// --- Initial Setup ---
messageInput.focus(); // Focus the input field when the page loads
adjustTextareaHeight(); // Set the initial height of the textarea correctly
console.log("Kramer Intelligence script initialized.");
// --- END Initial Setup ---