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
// --- REMOVED: Elements for separate image preview banner ---
// const imagePreviewContainer = document.getElementById('image-preview-container');
// const imagePreview = document.getElementById('image-preview');
// const removeImageButton = document.getElementById('remove-image-button');
// --- END REMOVED ---

// --- Configuration ---
const MAX_HISTORY_CHARS = 1000000;
const IMAGE_CHAR_EQUIVALENT = 1000;
const MAX_IMAGE_SIZE_MB = 15;
// --- End Configuration ---

// --- State Variables ---
let conversationHistory = [];
let selectedFile = null; // Store the File object
let selectedFileBase64 = null; // Store the Base64 data URL
// --- End State Variables ---


// --- Event Listeners ---
chatForm.addEventListener('submit', handleSendMessage);

// Listeners for image handling
attachButton.addEventListener('click', () => {
    // --- ADDED: Clear previous selection before opening dialog ---
    // This ensures 'change' event fires even if the same file is selected again
    // after being programmatically cleared (e.g., after sending).
    resetFileInput();
    // --- END ADDED ---
    imageUploadInput.click();
});

imageUploadInput.addEventListener('change', handleFileSelect);

// --- REMOVED: Listener for remove button ---
// removeImageButton.addEventListener('click', handleRemoveImage);
// --- END REMOVED ---


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
        // --- REMOVED: Logic to show separate preview banner ---
        // imagePreview.src = selectedFileBase64;
        // imagePreviewContainer.classList.remove('hidden');
        // --- END REMOVED ---
        hideError();
        // --- ADDED: Optionally change attach button style/indicator ---
        // Example: make attach button brighter or add a badge (requires CSS)
        attachButton.style.color = '#64b5f6'; // Indicate file selected
        // --- END ADDED ---
    };
    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading file.");
        clearSelectedFileState(); // Clear selection on error
    };
    reader.readAsDataURL(file);
}

// --- RENAMED/MODIFIED: Function to clear state without touching UI elements ---
function clearSelectedFileState() {
    selectedFile = null;
    selectedFileBase64 = null;
    // --- REMOVED: Logic to hide separate preview banner ---
    // imagePreview.src = '#';
    // imagePreviewContainer.classList.add('hidden');
    // --- END REMOVED ---
    resetFileInput();
     // --- ADDED: Reset attach button style ---
     attachButton.style.color = '#aaa'; // Reset attach button color
     // --- END ADDED ---
}
// --- END RENAMED/MODIFIED ---


function resetFileInput() {
    imageUploadInput.value = null;
}


async function handleSendMessage(event) {
    event.preventDefault();

    const userMessageText = messageInput.value.trim();

    if (!userMessageText && !selectedFileBase64) {
        // Don't show error if they just haven't typed/selected yet
        // showError("Please type a message or attach an image.");
        return; // Just do nothing if both are empty
    }

    sendButton.disabled = true;
    hideError();
    showLoading();

    const messageParts = [];
    let currentImageDataUrl = null;

    if (selectedFileBase64 && selectedFile) {
        messageParts.push({
            inlineData: {
                mimeType: selectedFile.type,
                data: selectedFileBase64
            }
        });
        currentImageDataUrl = selectedFileBase64;
    }
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
    }

    // Display user message (with image if present)
    displayMessage('user', userMessageText || '', currentImageDataUrl);
    scrollChatToBottom();

    // Add user message parts to history
    conversationHistory.push({
        role: 'user',
        parts: messageParts
    });

    // Clear inputs AFTER processing
    messageInput.value = '';
    clearSelectedFileState(); // Use the modified function to clear state

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

        // Add AI response to history
        conversationHistory.push({
            role: 'model',
            parts: [{ text: aiResponseText }]
        });

        // Display AI message
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


/**
 * Displays a message in the chat history UI. Handles text, images, and search suggestions.
 * @param {'user' | 'ai'} role The role of the message sender.
 * @param {string} text The message text content (can be empty string).
 * @param {string | null} [imageDataUrl=null] Optional Base64 data URL for an image to display.
 * @param {string | null} [searchSuggestionHtml=null] Optional HTML string for Google Search Suggestion.
 */
function displayMessage(role, text, imageDataUrl = null, searchSuggestionHtml = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    // Display Image if provided
    if (imageDataUrl) {
        const imgElement = document.createElement('img');
        imgElement.classList.add('message-image');
        imgElement.src = imageDataUrl;
        imgElement.alt = "User uploaded image";
        messageDiv.appendChild(imgElement);
    }

    // Display Text if provided
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
                paragraph.textContent = text; // Fallback
            }
        } else {
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
                    totalChars += IMAGE_CHAR_EQUIVALENT;
                }
            }
        }
    }

    // Remove oldest messages (user/model pairs)
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
    setTimeout(hideError, 5000);
}

/** Hides the error message. */
function hideError() {
    errorDisplay.classList.add('hidden');
    errorDisplay.textContent = '';
}

// --- Initial Setup ---
messageInput.focus();