// Existing DOM element references
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatHistory = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading');
const errorDisplay = document.getElementById('error');

// --- ADDED: Elements for image handling ---
const attachButton = document.getElementById('attach-button');
const imageUploadInput = document.getElementById('image-upload-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageButton = document.getElementById('remove-image-button');
// --- END ADDED ---

// --- Configuration ---
const MAX_HISTORY_CHARS = 1000000;
const IMAGE_CHAR_EQUIVALENT = 1000; // Heuristic for truncation
const MAX_IMAGE_SIZE_MB = 15; // Max image size in MB
// --- End Configuration ---

// --- State Variables ---
let conversationHistory = [];
let selectedFile = null; // Store the File object
let selectedFileBase64 = null; // Store the Base64 data URL
// --- End State Variables ---


// --- Event Listeners ---
chatForm.addEventListener('submit', handleSendMessage);

// --- ADDED: Listeners for image handling ---
attachButton.addEventListener('click', () => {
    imageUploadInput.click(); // Trigger hidden file input
});

imageUploadInput.addEventListener('change', handleFileSelect);

removeImageButton.addEventListener('click', handleRemoveImage);
// --- END ADDED ---


// --- Functions ---

// --- ADDED: Image Handling Functions ---
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Basic validation
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

    selectedFile = file; // Store the file object

    const reader = new FileReader();
    reader.onload = (e) => {
        selectedFileBase64 = e.target.result; // Store Base64 Data URL
        imagePreview.src = selectedFileBase64;
        imagePreviewContainer.classList.remove('hidden');
        hideError(); // Clear any previous errors
    };
    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading file.");
        handleRemoveImage(); // Clear selection on error
    };
    reader.readAsDataURL(file); // Read as Data URL for preview and easy sending
}

function handleRemoveImage() {
    selectedFile = null;
    selectedFileBase64 = null;
    imagePreview.src = '#'; // Clear preview src
    imagePreviewContainer.classList.add('hidden');
    resetFileInput();
}

function resetFileInput() {
    // Reset file input so the same file can be selected again after removal
    imageUploadInput.value = null;
}
// --- END ADDED ---


async function handleSendMessage(event) {
    event.preventDefault();

    const userMessageText = messageInput.value.trim();

    // Require either text or an image to send
    if (!userMessageText && !selectedFileBase64) {
        showError("Please type a message or attach an image.");
        return;
    }

    sendButton.disabled = true;
    hideError();
    showLoading();

    // --- Prepare message parts (text and/or image) ---
    const messageParts = [];
    let currentImageDataUrl = null; // Store image data for displayMessage

    if (selectedFileBase64 && selectedFile) {
        messageParts.push({
            inlineData: {
                mimeType: selectedFile.type,
                // Send the full Data URL; backend will strip prefix if needed
                data: selectedFileBase64
            }
        });
        currentImageDataUrl = selectedFileBase64; // Pass for immediate display
    }
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
    }
    // --- End Prepare message parts ---

    // Display user message (with image preview if applicable)
    displayMessage('user', userMessageText || '', currentImageDataUrl); // Pass image for display
    scrollChatToBottom();

    // Add user message parts to history object
    conversationHistory.push({
        role: 'user',
        parts: messageParts // Store potentially multi-part message
    });

    // --- Clear inputs AFTER processing ---
    messageInput.value = '';
    handleRemoveImage(); // Clear selected image state and preview
    // --- End Clear inputs ---

    messageInput.focus(); // Keep focus on input

    try {
        truncateHistory();

        const historyForThisRequest = [...conversationHistory];

        // --- Prepare payload for backend ---
        // Send the full history array
        const payload = { history: historyForThisRequest };
        // --- End Prepare payload ---


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

        // Add AI response text part to history
        conversationHistory.push({
            role: 'model',
            parts: [{ text: aiResponseText }] // Assume AI only sends text for now
        });

        // Display AI message
        displayMessage('ai', aiResponseText, null, searchSuggestionHtml); // Pass search suggestion
        scrollChatToBottom();

    } catch (err) {
        console.error("Error fetching AI response:", err);
        showError(err.message || "Failed to get response from AI. Please try again.");
        hideLoading();
    } finally {
        sendButton.disabled = false;
    }
}

/**
 * Displays a message in the chat history UI. Handles text, images, and search suggestions.
 * @param {'user' | 'ai'} role The role of the message sender.
 * @param {string} text The message text content (can be empty string).
 * @param {string | null} [imageDataUrl=null] Optional Base64 data URL for an image to display.
 * @param {string | null} [searchSuggestionHtml=null] Optional HTML string for Google Search Suggestion.
 */
function displayMessage(role, text, imageDataUrl = null, searchSuggestionHtml = null) { // MODIFIED: Added imageDataUrl
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    // --- ADDED: Display Image if provided ---
    if (imageDataUrl) {
        const imgElement = document.createElement('img');
        imgElement.classList.add('message-image');
        imgElement.src = imageDataUrl;
        imgElement.alt = "User uploaded image"; // Simple alt text
        messageDiv.appendChild(imgElement); // Append image first for user messages
    }
    // --- END ADDED ---

    // Display Text if provided
    if (text) { // Only create paragraph if text exists
        const paragraph = document.createElement('p');
        if (role === 'ai' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                marked.setOptions({ breaks: true, gfm: true });
                const rawHtml = marked.parse(text);
                const sanitizedHtml = DOMPurify.sanitize(rawHtml);
                paragraph.innerHTML = sanitizedHtml;
            } catch (error) {
                console.error("Error parsing or sanitizing Markdown:", error);
                paragraph.textContent = text; // Fallback
            }
        } else {
            // User text or if libraries failed
            paragraph.textContent = text;
        }
        messageDiv.appendChild(paragraph);
    }

    // Render Search Suggestion Chip if provided (for AI messages)
    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container');
        suggestionContainer.innerHTML = searchSuggestionHtml;
        messageDiv.appendChild(suggestionContainer);
    }

    chatHistory.appendChild(messageDiv);
}

/**
 * Checks the total character count of the history (incl. images) and removes oldest messages if over limit.
 */
function truncateHistory() {
    let totalChars = 0;
    for (const message of conversationHistory) {
        if (message.parts && Array.isArray(message.parts)) {
            for (const part of message.parts) {
                if (part.text) {
                    totalChars += part.text.length;
                } else if (part.inlineData) {
                    // --- ADDED: Count characters for images ---
                    totalChars += IMAGE_CHAR_EQUIVALENT;
                    // --- END ADDED ---
                }
            }
        }
    }

    // Remove oldest messages (user/model pairs)
    while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length >= 2) {
        const removedUserMsg = conversationHistory.shift();
        const removedModelMsg = conversationHistory.shift();

        // Recalculate removed characters accurately
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


/** Scrolls the chat history container to the bottom. */
function scrollChatToBottom() {
    setTimeout(() => {
        const chatContainer = document.getElementById('chat-container');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 0);
}

/** Shows the loading indicator. */
function showLoading() {
    loadingIndicator.classList.remove('hidden');
}

/** Hides the loading indicator. */
function hideLoading() {
    loadingIndicator.classList.add('hidden');
}

/** Shows an error message. */
function showError(message) {
    errorDisplay.textContent = message;
    errorDisplay.classList.remove('hidden');
    // Hide error after a few seconds
    setTimeout(hideError, 5000);
}

/** Hides the error message. */
function hideError() {
    errorDisplay.classList.add('hidden');
    errorDisplay.textContent = '';
}

// --- Initial Setup ---
messageInput.focus();