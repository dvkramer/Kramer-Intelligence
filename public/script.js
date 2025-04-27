// public/script.js

// --- DOM Element References ---
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
// --- END DOM Element References ---

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
messageInput.addEventListener('keydown', handleInputKeyDown); // For Enter/Shift+Enter
sendButton.addEventListener('click', handleSendButtonClick); // For button click
// Listeners for image handling
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

// --- Textarea Height Adjustment ---
function adjustTextareaHeight() {
    // Temporarily reset height to 'auto' to get the natural scrollHeight
    messageInput.style.height = 'auto';
    // Set the height to the scrollHeight, respecting the max-height from CSS
    messageInput.style.height = `${messageInput.scrollHeight}px`;
}
// --- END Textarea Height Adjustment ---

// --- Scrolling Functions ---
// Scrolls fully to the bottom (smoothly) - Used for user messages
function scrollChatToBottom() {
    setTimeout(() => {
        mainContentArea.scrollTo({
            top: mainContentArea.scrollHeight,
            behavior: 'smooth'
        });
    }, 50);
}

// Scrolls smoothly to the top of a new AI message
function scrollToMessageTop(messageElement) {
    setTimeout(() => {
        const messageTopOffset = messageElement.offsetTop;
        let desiredScrollTop = messageTopOffset - SCROLL_PADDING_TOP;
        desiredScrollTop = Math.max(0, desiredScrollTop);

        // Always attempt the smooth scroll
        mainContentArea.scrollTo({
            top: desiredScrollTop,
            behavior: 'smooth'
        });
    }, 100);
}
// --- END Scrolling Functions ---

// --- Input Handling ---
// Handles keydown events in the textarea (Enter vs Shift+Enter)
function handleInputKeyDown(event) {
    if (event.key === 'Enter') {
        if (event.shiftKey) {
            // Shift+Enter: Allow default newline behavior. Height adjusted by 'input' listener.
            console.log("Shift+Enter detected - Allowing newline.");
        } else {
            // Enter alone: Prevent newline, send message.
            console.log("Enter alone detected - Preventing newline, triggering send.");
            event.preventDefault();
            handleSendMessage();
        }
    }
}

// Handles clicks on the explicit Send button
function handleSendButtonClick() {
    console.log("Send button clicked - triggering send.");
    handleSendMessage();
}
// --- END Input Handling ---

// --- Image Handling Functions ---
// Processes a selected file (from input or paste)
function processSelectedFile(file) {
    if (!file) return false;
    // Validate Type
    if (!file.type.startsWith('image/')) {
        showError('Pasted/Selected item is not a valid image file.');
        handleRemoveImage(); // Clear state
        return false;
    }
    // Validate Size
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        showError(`Image size should not exceed ${MAX_IMAGE_SIZE_MB} MB.`);
        handleRemoveImage(); // Clear state
        return false;
    }
    // Read file and update UI
    hideError();
    const reader = new FileReader();
    reader.onload = (e) => {
        selectedFileBase64 = e.target.result;
        selectedFile = file; // Store the File object too
        imagePreview.src = selectedFileBase64;
        imagePreviewContainer.classList.remove('hidden');
        attachButton.classList.add('has-file');
        console.log("Image processed:", file.name);
    };
    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading the image file.");
        handleRemoveImage(); // Clean up on error
    };
    reader.readAsDataURL(file);
    return true; // Indicate async processing started
 }

// Handles file selection via the file input element
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const processed = processSelectedFile(file);
    // Reset input only if validation failed immediately
    if (!processed) {
        resetFileInput();
    }
}

// Handles paste events (for images, when input is focused)
function handlePaste(event) {
    // Only handle paste if input is focused
    if (document.activeElement !== messageInput) { return; }
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
                    event.preventDefault(); // Prevent pasting file path if image handled
                    console.log("Image paste handled.");
                    break; // Handle only first image
                }
            }
        }
    }
    // Text paste will trigger 'input' event naturally if no image handled
}

// Handles click on the remove image button or clears image state programmatically
function handleRemoveImage() {
    selectedFile = null;
    selectedFileBase64 = null;
    imagePreview.src = '#';
    imagePreviewContainer.classList.add('hidden');
    resetFileInput(); // Clear the actual file input
    attachButton.classList.remove('has-file');
    hideError(); // Clear any related errors
    console.log("Selected image removed and state reset.");
}

// Resets the value of the hidden file input
function resetFileInput() {
    imageUploadInput.value = null;
}
// --- END Image Handling Functions ---


// --- Core Message Sending Logic ---
async function handleSendMessage() {
    const userMessageText = messageInput.value.trim();
    // Must have text or an image to send
    if (!userMessageText && !selectedFileBase64) {
        console.log("Send ignored: No text or image selected.");
        return;
    }

    // Disable UI elements during processing
    sendButton.disabled = true;
    hideError();
    showLoading();

    // Prepare message parts for API
    const messageParts = [];
    let currentImageDataUrl = null; // For local display in user bubble
    if (selectedFileBase64 && selectedFile) {
        messageParts.push({ inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 } });
        currentImageDataUrl = selectedFileBase64;
    }
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
    }

    // Display user message immediately (handles its own scrolling)
    displayMessage('user', userMessageText || '', currentImageDataUrl);

    // Add to conversation history for API call
    conversationHistory.push({ role: 'user', parts: messageParts });

    // Clear input elements *after* using their values
    messageInput.value = '';
    handleRemoveImage(); // Resets image selection state and preview
    adjustTextareaHeight(); // Reset textarea height
    messageInput.focus(); // Keep focus in the input area

    // --- API Call Section ---
    try {
        truncateHistory(); // Ensure history isn't too long
        const historyForThisRequest = [...conversationHistory]; // Use a copy
        const payload = { history: historyForThisRequest };

        // Make the call to the backend API
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        hideLoading(); // Hide loading indicator once response (or error) is received

        // Handle API errors
        if (!response.ok) {
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) { console.warn("Could not parse API error response body."); }
            throw new Error(errorMsg); // Throw to be caught below
        }

        // Process successful response
        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml;
        const modelUsed = data.modelUsed; // Optional: see which model was used
        console.log(`AI Response received (using ${modelUsed || 'model'})`);

        // Add AI response to conversation history
        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });

        // Display AI message (handles its own scrolling)
        displayMessage('ai', aiResponseText, null, searchSuggestionHtml);

    } catch (err) {
        // Handle fetch errors or errors thrown from response processing
        console.error("Error during send/receive:", err);
        showError(err.message || "Failed to get response from AI.");
        hideLoading(); // Ensure loading is hidden on error
    } finally {
        // Re-enable send button regardless of success/failure
        sendButton.disabled = false;
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
        imgElement.classList.add('message-image');
        imgElement.src = imageDataUrl;
        imgElement.alt = "User uploaded image";
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
            } catch (error) {
                console.error("Markdown processing error:", error);
                paragraph.textContent = text; // Fallback to plain text
            }
        } else {
            // Display user text or AI text if libs are missing
            paragraph.textContent = text;
        }
        // Append paragraph only if it has content
        if (paragraph.innerHTML || paragraph.textContent) {
             messageDiv.appendChild(paragraph);
        }
    }

    // Add Google Search suggestions if provided - Inject Directly
    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container'); // Only for margin

        try {
            // Directly inject Google's HTML without sanitization per their requirements
            suggestionContainer.innerHTML = searchSuggestionHtml;
             console.log("Directly appended search suggestions HTML.");

             // Append container only if it's not empty after assignment
             if (suggestionContainer.innerHTML.trim()) {
                 messageDiv.appendChild(suggestionContainer);
             } else {
                 console.log("Google Search suggestion HTML was empty.");
             }
        } catch (error) {
             console.error("Error setting innerHTML for search suggestions:", error);
        }
    }

    // Add the fully constructed message bubble to the chat history UI
    chatHistory.appendChild(messageDiv);

    // Trigger the appropriate scrolling behavior
    if (role === 'user') {
        scrollChatToBottom(); // Smooth scroll fully down for user
    } else if (role === 'ai') {
        scrollToMessageTop(messageDiv); // Smooth scroll to top of AI message
    }
}
// --- END Display & Formatting ---

// --- History Management ---
// Truncates the conversation history if it exceeds the character limit
function truncateHistory() {
    let totalChars = 0;
    // Calculate current size
    for (const message of conversationHistory) {
        if (message.parts && Array.isArray(message.parts)) {
            for (const part of message.parts) {
                if (part.text) { totalChars += part.text.length; }
                else if (part.inlineData) { totalChars += IMAGE_CHAR_EQUIVALENT; }
            }
        }
    }
    // Remove oldest user/model pair if limit exceeded
    while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length >= 2) {
        // console.log(`History limit exceeded (${totalChars}/${MAX_HISTORY_CHARS}). Truncating.`);
        const removedUserMsg = conversationHistory.shift(); // Remove oldest (user)
        const removedModelMsg = conversationHistory.shift(); // Remove next oldest (model)
        let removedChars = 0;
        // Recalculate removed characters accurately
        [removedUserMsg, removedModelMsg].forEach(msg => {
             if (msg?.parts && Array.isArray(msg.parts)) {
                msg.parts.forEach(part => {
                    if (part.text) removedChars += part.text.length;
                    else if (part.inlineData) removedChars += IMAGE_CHAR_EQUIVALENT;
                });
            }
        });
        totalChars -= removedChars; // Update total count
        // console.log(`Removed pair. New count: ~${totalChars}`);
    }
}
// --- END History Management ---

// --- UI Utility Functions ---
// Shows the loading indicator
function showLoading() {
    loadingIndicator.classList.remove('hidden');
}

// Hides the loading indicator
function hideLoading() {
    loadingIndicator.classList.add('hidden');
}

// Displays an error message
function showError(message) {
    errorDisplay.textContent = message;
    errorDisplay.classList.remove('hidden');
    console.error("Displaying error to user:", message);
}

// Hides the error message area
function hideError() {
    errorDisplay.classList.add('hidden');
    errorDisplay.textContent = ''; // Clear text when hiding
}
// --- END UI Utility Functions ---


// --- Initial Setup ---
// Focus the input field when the page loads
messageInput.focus();
// Set the initial height of the textarea correctly
adjustTextareaHeight();
console.log("Kramer Intelligence script initialized.");
// --- END Initial Setup ---