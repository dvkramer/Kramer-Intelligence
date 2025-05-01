// public/script.js

// DOM element references
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input'); // Textarea
const sendButton = document.getElementById('send-button');
const chatHistory = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading');
const errorDisplay = document.getElementById('error');
const attachButton = document.getElementById('attach-button');
const fileUploadInput = document.getElementById('file-upload-input'); // Updated ID
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageButton = document.getElementById('remove-image-button'); // Button used for both types now
const mainContentArea = document.getElementById('main-content-area'); // Scrolling container

// --- Configuration ---
const MAX_FILE_SIZE_MB = 15; // Matches backend limit for inline uploads
const SCROLL_PADDING_TOP = 10; // Pixels above the AI message top when scrolling
// --- End Configuration ---

// --- State Variables ---
let conversationHistory = [];
let selectedFile = null;
let selectedFileType = null; // 'image' or 'pdf'
let selectedFileBase64 = null; // Data URL (includes prefix like 'data:image/png;base64,')
// --- End State Variables ---

// --- Event Listeners ---
messageInput.addEventListener('keydown', handleInputKeyDown);
sendButton.addEventListener('click', handleSendButtonClick);
attachButton.addEventListener('click', () => {
    resetFileInput();
    fileUploadInput.click(); // Use updated input ID
});
fileUploadInput.addEventListener('change', handleFileSelect); // Use updated input ID
removeImageButton.addEventListener('click', handleRemoveFile); // Renamed handler
document.addEventListener('paste', handlePaste); // Handles image paste only for now
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
    // Add a small buffer to prevent scrollbar from appearing unnecessarily in some cases
    messageInput.style.height = `${messageInput.scrollHeight + 2}px`;
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
        // Add a check: if scroll jumped DOWN significantly right after adding content, reset it.
        // This can happen if the browser recalculates layout causing a jump before smooth scroll starts.
        if (isNearBottomInitially && currentScrollTop > initialScrollTop + 10) {
             console.log(`Scroll jumped down from ${initialScrollTop} to ${currentScrollTop} after adding AI message. Resetting.`);
             mainContentArea.scrollTop = initialScrollTop;
        }

        // Second frame to ensure the DOM is updated and offsets are correct
        requestAnimationFrame(() => {
            const messageTopOffset = messageElement.offsetTop;
            let desiredScrollTop = messageTopOffset - SCROLL_PADDING_TOP;
            desiredScrollTop = Math.max(0, desiredScrollTop); // Don't scroll above the top

            // Check if the message is already fully visible
            const messageBottomOffset = messageTopOffset + messageElement.offsetHeight;
            const currentViewBottom = mainContentArea.scrollTop + mainContentArea.clientHeight;

            if (messageTopOffset >= mainContentArea.scrollTop && messageBottomOffset <= currentViewBottom) {
                // console.log("AI message already fully visible, not scrolling.");
            } else {
                // console.log(`Scrolling to AI message top: ${desiredScrollTop}`);
                mainContentArea.scrollTo({
                    top: desiredScrollTop,
                    behavior: 'smooth'
                });
            }
        });
    });
}
// --- END Scrolling Functions ---

// --- Input Handling ---
function handleInputKeyDown(event) { if (event.key === 'Enter') { if (event.shiftKey) { /* Allow newline */ } else { event.preventDefault(); handleSendMessage(); } } }
function handleSendButtonClick() { handleSendMessage(); }
// --- END Input Handling ---

// --- File Handling Functions ---
function processSelectedFile(file) {
    if (!file) return false;

    // Check file type
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
        showError('Invalid file type. Please select an image (PNG, JPG, WEBP, HEIC, HEIF) or a PDF.');
        handleRemoveFile(); // Clear selection
        return false;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        showError(`File is too large (> ${MAX_FILE_SIZE_MB} MB). Max size for direct upload is limited.`);
        handleRemoveFile(); // Clear selection
        return false;
    }

    hideError(); // Clear previous errors
    const reader = new FileReader();

    reader.onload = (e) => {
        selectedFileBase64 = e.target.result; // This is the Data URL (e.g., data:image/png;base64,...)
        selectedFile = file;
        selectedFileType = isImage ? 'image' : 'pdf';

        // Update UI based on type
        if (isImage) {
            imagePreview.src = selectedFileBase64;
            imagePreviewContainer.classList.remove('hidden'); // Show image preview
        } else { // For PDF
            imagePreview.src = '#'; // Clear any previous image src
            imagePreviewContainer.classList.add('hidden'); // Hide the image preview area
            // Optionally display PDF filename near attach button or input? For minimal change, rely on button state.
        }
        attachButton.classList.add('has-file'); // Indicate *some* file is attached
        console.log(`${selectedFileType.toUpperCase()} processed: ${file.name}`);
    };

    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading the selected file.");
        handleRemoveFile(); // Clear selection on error
    };

    reader.readAsDataURL(file); // Read as Data URL for both types
    return true; // Indicates processing started
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return; // No file selected
    const processed = processSelectedFile(file);
    if (!processed) {
        // If processing failed immediately (e.g., wrong type/size), reset the input
        resetFileInput();
    }
}

// Handle pasting *images* only for now
function handlePaste(event) {
    // Only act if the paste target is the message input
    if (document.activeElement !== messageInput) {
        return;
    }
    const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
    if (!items) { return; }

    let foundImage = false;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Check if it's a file and if it's an image type
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const imageFile = item.getAsFile();
            if (imageFile) {
                console.log("Image pasted, processing...");
                // If another file was already selected, remove it first
                if (selectedFile) {
                    handleRemoveFile();
                }
                const processed = processSelectedFile(imageFile);
                if (processed) {
                    foundImage = true;
                    event.preventDefault(); // Prevent pasting text representation of image
                    console.log("Image paste handled successfully.");
                    break; // Handle only the first image found
                } else {
                     console.log("Pasted image processing failed.");
                }
            }
        }
    }
}

// Renamed: Handles removing the currently selected file (image or PDF)
function handleRemoveFile() {
    selectedFile = null;
    selectedFileBase64 = null;
    selectedFileType = null;
    imagePreview.src = '#'; // Clear preview src
    imagePreviewContainer.classList.add('hidden'); // Hide preview container
    resetFileInput(); // Clear the actual file input element
    attachButton.classList.remove('has-file'); // Update attach button style
    hideError(); // Clear any file-related errors
    console.log("Selected file removed.");
}

// Resets the file input element itself
function resetFileInput() {
    fileUploadInput.value = null; // Clears the selection in the <input type="file">
}
// --- END File Handling Functions ---


// --- Core Message Sending Logic ---
async function handleSendMessage() {
    const userMessageText = messageInput.value.trim();
    // Check if there's either text OR a file selected
    if (!userMessageText && !selectedFile) {
        console.log("Send attempt ignored: No text or file.");
        return;
    }

    // Disable button immediately to prevent double sends
    sendButton.disabled = true;
    hideError();
    showLoading(); // Show loading indicator early

    const messageParts = [];
    let fileInfoForDisplay = null; // Store info needed by displayMessage

    // --- Prepare Parts ---
    // Capture file data FIRST (before clearing selection)
    if (selectedFileBase64 && selectedFile && selectedFileType) {
        // IMPORTANT: The backend needs *only* the Base64 data part, extracted from the Data URL.
        // The backend's getBase64Data function handles this extraction.
        // Here, we send the full Data URL, and the backend extracts it.
        messageParts.push({
            inlineData: {
                mimeType: selectedFile.type,
                data: selectedFileBase64 // Send the full Data URL
            }
        });

        // Prepare info for the UI display function
        if (selectedFileType === 'image') {
            fileInfoForDisplay = { type: 'image', dataUrl: selectedFileBase64, name: selectedFile.name };
        } else if (selectedFileType === 'pdf') {
             fileInfoForDisplay = { type: 'pdf', name: selectedFile.name };
        }
    }
    // Capture text data
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
    }

    // Double-check if there's anything to send (shouldn't happen due to initial check, but safe)
    if (messageParts.length === 0) {
        hideLoading();
        sendButton.disabled = false;
        console.warn("Message sending aborted: No parts were prepared.");
        return;
    }

    // --- Display User Message ---
    // Display the user's message *before* clearing the input/file
    displayMessage('user', userMessageText || '', fileInfoForDisplay); // Pass fileInfo for UI

    // --- Add to History & Clear Inputs ---
    conversationHistory.push({ role: 'user', parts: messageParts });
    messageInput.value = ''; // Clear the text input
    handleRemoveFile();    // Clear the selected file (image or PDF) and preview
    adjustTextareaHeight(); // Reset textarea height after clearing

    // --- Conditional Focus/Blur ---
    if (isMobileDevice()) {
        // On mobile: Blur the input to hide the virtual keyboard
        messageInput.blur();
        console.log("Mobile device detected, blurring input.");
    } else {
        // On desktop: Keep focus on the input for easy next message typing
        messageInput.focus();
        console.log("Desktop device detected, retaining focus.");
    }
    // --- End Conditional Focus/Blur ---

    // --- API Call Section ---
    // NOTE: History truncation now happens entirely on the server side
    try {
        // Use the current conversation history for this request
        const historyForThisRequest = [...conversationHistory];
        const payload = { history: historyForThisRequest };

        console.log("Sending payload to /api/chat:", /* Optionally log payload structure, be careful with large base64 */ { historyLength: historyForThisRequest.length });
        // console.log("Payload detail (excluding base64):", JSON.stringify(payload, (key, value) => key === 'data' ? '...' : value));


        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        hideLoading(); // Hide loading indicator once response starts or finishes

        if (!response.ok) {
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try {
                // Try to get more specific error from JSON response
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                console.warn("Could not parse API error response as JSON.");
                // If JSON parsing fails, maybe get raw text?
                const errorText = await response.text().catch(() => '');
                if (errorText) errorMsg += `\nResponse: ${errorText.substring(0, 200)}...`;
            }
             // Add specific handling for 413 Payload Too Large
             if (response.status === 413) {
                errorMsg = `Request Failed: Payload too large (${response.statusText}). This might be due to image/PDF size or very long text. Max file size is ~${MAX_FILE_SIZE_MB}MB.`;
             }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml;
        const modelUsed = data.modelUsed;
        console.log(`AI Response received (using ${modelUsed || 'unknown model'})`);

        // Add AI response to history (only the text part for history)
        // If the AI response could include generated images/files in the future, this would need adjustment
        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });

        // Display AI response
        displayMessage('ai', aiResponseText, null, searchSuggestionHtml); // Pass search suggestions if present

    } catch (err) {
        console.error("Error during send/receive:", err);
        showError(err.message || "Failed to get response from the server.");
        hideLoading(); // Ensure loading is hidden on error
        // Rollback? If API fails, maybe remove the user message we optimistically added?
        // This prevents desync between UI and actual backend history state.
        // Find the corresponding user message DIV and remove it? Or just pop from `conversationHistory`?
        const lastUserMessage = conversationHistory.pop(); // Remove the failed user message from history
        // Also remove the displayed user message bubble? Requires finding it.
        const userMessages = chatHistory.querySelectorAll('.user-message');
        if (userMessages.length > 0) {
            userMessages[userMessages.length - 1].remove();
            console.log("Removed last user message bubble due to API error.");
        }
        console.warn("Rolled back last user message due to API error:", lastUserMessage);

    } finally {
        // --- Re-enable Send Button ---
        // Ensure the send button is re-enabled regardless of success or failure
        sendButton.disabled = false;
        // Focus is handled conditionally above based on device type after sending.
    }
    // --- END API Call Section ---
}
// --- END Core Message Sending Logic ---


// --- Display & Formatting ---
// Displays a message bubble in the chat history
function displayMessage(role, text, fileInfo = null, searchSuggestionHtml = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    let contentAdded = false; // Track if any content (text, image, pdf) was added

    // Add image or PDF info element if provided (only for user messages)
    if (fileInfo && role === 'user') {
        if (fileInfo.type === 'image' && fileInfo.dataUrl) {
            const imgElement = document.createElement('img');
            imgElement.classList.add('message-image');
            imgElement.src = fileInfo.dataUrl;
            imgElement.alt = `User uploaded image: ${fileInfo.name || 'image'}`; // Add filename to alt text
            imgElement.title = `Click to view image: ${fileInfo.name || 'image'}`; // Tooltip
            // Optional: Add click handler to open image in new tab/modal
            imgElement.addEventListener('click', () => window.open(fileInfo.dataUrl, '_blank'));
            messageDiv.appendChild(imgElement);
            contentAdded = true;
        } else if (fileInfo.type === 'pdf' && fileInfo.name) {
            const pdfInfoDiv = document.createElement('div');
            pdfInfoDiv.classList.add('pdf-info');
            pdfInfoDiv.textContent = `📎 Sent PDF: ${fileInfo.name}`;
            messageDiv.appendChild(pdfInfoDiv);
            contentAdded = true;
        }
    }

    // Add text element if provided
    if (text) {
        const paragraph = document.createElement('p');
        // Process AI text with Markdown & Sanitize (but NOT Google Search HTML)
        // Preserve newlines/whitespace for user text using CSS white-space: pre-wrap;
        if (role === 'ai' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                marked.setOptions({
                     breaks: true, // Convert single line breaks to <br>
                     gfm: true,    // Enable GitHub Flavored Markdown
                     // Consider adding more options like syntax highlighting later if needed
                 });
                const rawHtml = marked.parse(text);
                // Sanitize the AI's generated Markdown output
                const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
                    USE_PROFILES: { html: true } // Allow basic HTML structure from Markdown
                });
                paragraph.innerHTML = sanitizedHtml;
            } catch (error) {
                console.error("Markdown processing error:", error);
                paragraph.textContent = text; // Fallback to plain text on error
            }
        } else {
            // For user text or if Markdown libs aren't loaded
            paragraph.textContent = text;
        }
        // Only append if there's actual content (prevents empty <p> tags)
        if (paragraph.innerHTML.trim() || paragraph.textContent.trim()) {
             messageDiv.appendChild(paragraph);
             contentAdded = true;
        }
    }

    // Add Google Search suggestions if provided - Inject Directly
    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container'); // Only for margin

        try {
            // Directly inject Google's HTML without sanitization per their requirements
            suggestionContainer.innerHTML = searchSuggestionHtml;

            // Append container only if it's not empty after assignment
            if (suggestionContainer.innerHTML.trim()) {
                 messageDiv.appendChild(suggestionContainer);
                 contentAdded = true; // Consider search results as content
            } else {
                console.warn("Search suggestion HTML was provided but resulted in empty container.");
            }
        } catch (error) {
             console.error("Error setting innerHTML for search suggestions:", error);
             // Don't append the container if there was an error setting HTML
        }
    }

    // Only append the messageDiv if it actually contains something
    if (contentAdded) {
        chatHistory.appendChild(messageDiv);

        // Trigger the appropriate scrolling behavior AFTER appending
        if (role === 'user') {
            scrollChatToBottom(); // Smooth scroll fully down for user
        } else if (role === 'ai') {
             // Give the browser a moment to render before calculating position
             setTimeout(() => scrollToMessageTop(messageDiv), 50);
        }
    } else {
         console.warn("Skipped appending an empty message bubble.");
    }
}
// --- END Display & Formatting ---

// --- UI Utility Functions ---
function showLoading() { loadingIndicator.classList.remove('hidden'); }
function hideLoading() { loadingIndicator.classList.add('hidden'); }
function showError(message) { errorDisplay.textContent = message; errorDisplay.classList.remove('hidden'); console.error("Displaying error:", message); /* Optionally scroll error into view */ errorDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function hideError() { errorDisplay.classList.add('hidden'); errorDisplay.textContent = ''; }
// --- END UI Utility Functions ---


// --- Initial Setup ---
messageInput.focus(); // Focus the input field when the page loads
adjustTextareaHeight(); // Set the initial height of the textarea correctly
console.log("Kramer Intelligence script initialized.");
// --- END Initial Setup ---