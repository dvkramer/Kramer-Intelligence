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

// --- Mobile Detection Helper ---
function isMobileDevice() {
    // Basic check combining touch capability and common user agent keywords
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
    const isLikelyMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    // Consider it mobile if it has touch AND a mobile-like UA string.
    // Adjust logic if needed (e.g., just checking hasTouch might be sufficient)
    return hasTouch && isLikelyMobileUA;
}
// --- END Mobile Detection Helper ---


// --- Textarea Height Adjustment ---
function adjustTextareaHeight() {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${messageInput.scrollHeight}px`;
}

// --- Scrolling Functions ---
// Scrolls fully to the bottom (smoothly) - Used for user messages
function scrollChatToBottom() {
    requestAnimationFrame(() => {
        mainContentArea.scrollTo({
            top: mainContentArea.scrollHeight,
            behavior: 'smooth'
        });
    });
}

// Scrolls smoothly to the top of a new AI message using requestAnimationFrame
function scrollToMessageTop(messageElement) {
    const initialScrollTop = mainContentArea.scrollTop;
    const initialScrollHeight = mainContentArea.scrollHeight;
    const clientHeight = mainContentArea.clientHeight;
    const isNearBottomInitially = (initialScrollHeight - initialScrollTop - clientHeight) < 50;

    requestAnimationFrame(() => {
        const currentScrollTop = mainContentArea.scrollTop;
        if (isNearBottomInitially && currentScrollTop > initialScrollTop + 10) {
             console.log(`Scroll jumped down from ${initialScrollTop} to ${currentScrollTop}. Resetting.`);
             mainContentArea.scrollTop = initialScrollTop;
        }

        requestAnimationFrame(() => {
            const messageTopOffset = messageElement.offsetTop;
            let desiredScrollTop = messageTopOffset - SCROLL_PADDING_TOP;
            desiredScrollTop = Math.max(0, desiredScrollTop);

            mainContentArea.scrollTo({
                top: desiredScrollTop,
                behavior: 'smooth'
            });
        });
    });
}
// --- END Scrolling Functions ---

// --- Input Handling ---
function handleInputKeyDown(event) { if (event.key === 'Enter') { if (event.shiftKey) { /* Allow newline */ } else { event.preventDefault(); handleSendMessage(); } } }
function handleSendButtonClick() { handleSendMessage(); }
// --- END Input Handling ---

// --- Image Handling Functions ---
function processSelectedFile(file) { if (!file) return false; if (!file.type.startsWith('image/')) { showError('Invalid image file.'); handleRemoveImage(); return false; } if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) { showError(`Image > ${MAX_IMAGE_SIZE_MB} MB.`); handleRemoveImage(); return false; } hideError(); const reader = new FileReader(); reader.onload = (e) => { selectedFileBase64 = e.target.result; selectedFile = file; imagePreview.src = selectedFileBase64; imagePreviewContainer.classList.remove('hidden'); attachButton.classList.add('has-file'); console.log("Image processed:", file.name); }; reader.onerror = (e) => { console.error("FileReader error:", e); showError("Error reading image."); handleRemoveImage(); }; reader.readAsDataURL(file); return true; }
function handleFileSelect(event) { const file = event.target.files[0]; if (!file) return; const processed = processSelectedFile(file); if (!processed) { resetFileInput(); } }
function handlePaste(event) { if (document.activeElement !== messageInput) { return; } const items = (event.clipboardData || event.originalEvent.clipboardData)?.items; if (!items) { return; } let foundImage = false; for (let i = 0; i < items.length; i++) { const item = items[i]; if (item.kind === 'file' && item.type.startsWith('image/')) { const imageFile = item.getAsFile(); if (imageFile) { const processed = processSelectedFile(imageFile); if (processed) { foundImage = true; event.preventDefault(); console.log("Image paste handled."); break; } } } } }
function handleRemoveImage() { selectedFile = null; selectedFileBase64 = null; imagePreview.src = '#'; imagePreviewContainer.classList.add('hidden'); resetFileInput(); attachButton.classList.remove('has-file'); hideError(); console.log("Selected image removed."); }
function resetFileInput() { imageUploadInput.value = null; }
// --- END Image Handling Functions ---


// --- Core Message Sending Logic ---
async function handleSendMessage() {
    const userMessageText = messageInput.value.trim();
    if (!userMessageText && !selectedFileBase64) { return; }

    // Disable button immediately
    sendButton.disabled = true;
    hideError();
    showLoading(); // Show loading indicator early

    const messageParts = [];
    let currentImageDataUrl = null;

    // Capture image data FIRST (before clearing it)
    if (selectedFileBase64 && selectedFile) {
        messageParts.push({ inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 } });
        currentImageDataUrl = selectedFileBase64; // Store for display
    }
    // Capture text data
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
    }

    // --- Display User Message ---
    // Display the user's message *before* clearing the input/image
    displayMessage('user', userMessageText || '', currentImageDataUrl); // Handles scroll

    // --- Add to History & Clear Inputs ---
    conversationHistory.push({ role: 'user', parts: messageParts });
    messageInput.value = ''; // Clear the text input
    handleRemoveImage();    // Clear the selected image and preview
    adjustTextareaHeight(); // Reset textarea height after clearing

    // --- Conditional Focus/Blur ---
    if (isMobileDevice()) {
        // On mobile: Blur the input to hide the virtual keyboard
        messageInput.blur(); // <<< BLUR ADDED FOR MOBILE
        console.log("Mobile device detected, blurring input.");
    } else {
        // On desktop: Keep focus on the input for easy next message typing
        messageInput.focus(); // <<< FOCUS RETAINED FOR DESKTOP
        console.log("Desktop device detected, retaining focus.");
    }
    // --- End Conditional Focus/Blur ---

    // --- API Call Section ---
    try {
        truncateHistory();
        const historyForThisRequest = [...conversationHistory];
        const payload = { history: historyForThisRequest };

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        hideLoading(); // Hide loading indicator once fetch starts or finishes

        if (!response.ok) {
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                console.warn("Could not parse API error.");
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml;
        const modelUsed = data.modelUsed; // Optional: Log which model was used
        console.log(`AI Response received (using ${modelUsed || 'default model'})`); // Adjusted log

        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });

        // Display AI response
        displayMessage('ai', aiResponseText, null, searchSuggestionHtml); // Handles scroll

    } catch (err) {
        console.error("Error during send/receive:", err);
        showError(err.message || "Failed to get response.");
        hideLoading(); // Ensure loading is hidden on error
        // Optionally: Remove the last user message from history if API fails?
        // conversationHistory.pop(); // Uncomment to rollback history on failure
    } finally {
        // --- Re-enable Send Button ---
        sendButton.disabled = false;
        // Focus is handled conditionally above, no action needed here.
    }
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

            // Append container only if it's not empty after assignment
            if (suggestionContainer.innerHTML.trim()) { messageDiv.appendChild(suggestionContainer); }
        } catch (error) { console.error("Error setting innerHTML for search suggestions:", error); }
    }

    // Add the fully constructed message bubble to the chat history UI
    chatHistory.appendChild(messageDiv);

    // Trigger the appropriate scrolling behavior AFTER appending
    if (role === 'user') { scrollChatToBottom(); } // Smooth scroll fully down for user
    else if (role === 'ai') { scrollToMessageTop(messageDiv); } // Smooth scroll to top of AI message
}
// --- END Display & Formatting ---

// --- History Management ---
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