// public/script.js

// DOM element references
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatHistory = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading');
const errorDisplay = document.getElementById('error');
const attachButton = document.getElementById('attach-button');
const fileUploadInput = document.getElementById('file-upload-input');
const filePreviewContainer = document.getElementById('file-preview-container');
const filePreviewContent = document.getElementById('file-preview-content');
const filePreviewImage = document.getElementById('file-preview-image');
const filePreviewPdf = document.getElementById('file-preview-pdf');
const pdfFilenameSpan = document.getElementById('pdf-filename');
const removeFileButton = document.getElementById('remove-file-button');
const mainContentArea = document.getElementById('main-content-area');

// --- Configuration ---
// REMOVED: MAX_HISTORY_CHARS and FILE_CHAR_EQUIVALENT (handled by backend now)
const MAX_FILE_SIZE_MB = 15; // Max size check before upload (frontend check)
const SCROLL_PADDING_TOP = 10;
// --- End Configuration ---

// --- State Variables ---
let conversationHistory = []; // Holds the FULL history, sent to backend
let selectedFile = null;
let selectedFileBase64 = null; // This is the Data URL
// --- End State Variables ---

// --- Event Listeners ---
messageInput.addEventListener('keydown', handleInputKeyDown);
sendButton.addEventListener('click', handleSendButtonClick);
attachButton.addEventListener('click', () => {
    resetFileInput();
    fileUploadInput.click();
});
fileUploadInput.addEventListener('change', handleFileSelect);
removeFileButton.addEventListener('click', handleRemoveFile);
document.addEventListener('paste', handlePaste);
messageInput.addEventListener('input', adjustTextareaHeight);
// --- END Event Listeners ---

// --- Functions ---

function isMobileDevice() {
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
    const isLikelyMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return hasTouch && isLikelyMobileUA;
}

function adjustTextareaHeight() {
    messageInput.style.height = 'auto'; // Reset height
    // Ensure scrollHeight doesn't exceed max-height defined in CSS
    const maxHeight = parseInt(window.getComputedStyle(messageInput).maxHeight, 10);
    const requiredHeight = messageInput.scrollHeight;
    messageInput.style.height = `${Math.min(requiredHeight, maxHeight)}px`;
     // Show scrollbar if content exceeds max-height
     messageInput.style.overflowY = (requiredHeight > maxHeight) ? 'auto' : 'hidden';
}

function scrollChatToBottom() {
    requestAnimationFrame(() => {
        mainContentArea.scrollTo({
            top: mainContentArea.scrollHeight,
            behavior: 'smooth'
        });
    });
}

function scrollToMessageTop(messageElement) {
    const initialScrollTop = mainContentArea.scrollTop;
    const initialScrollHeight = mainContentArea.scrollHeight;
    const clientHeight = mainContentArea.clientHeight;
    const isNearBottomInitially = (initialScrollHeight - initialScrollTop - clientHeight) < 50;

    requestAnimationFrame(() => {
        const currentScrollTop = mainContentArea.scrollTop;
        // Prevent weird jumps if already scrolled down significantly while AI was thinking
        if (isNearBottomInitially && currentScrollTop > initialScrollTop + 10) {
             // console.log(`Scroll jumped down from ${initialScrollTop} to ${currentScrollTop}. Resetting.`);
             mainContentArea.scrollTop = initialScrollTop;
        }

        requestAnimationFrame(() => {
            const messageTopOffset = messageElement.offsetTop;
            let desiredScrollTop = messageTopOffset - SCROLL_PADDING_TOP;
            desiredScrollTop = Math.max(0, desiredScrollTop); // Ensure not negative

            mainContentArea.scrollTo({
                top: desiredScrollTop,
                behavior: 'smooth'
            });
        });
    });
}

function handleInputKeyDown(event) {
    if (event.key === 'Enter') {
        if (event.shiftKey) {
            // Allow shift+enter for newline
        } else {
            event.preventDefault(); // Prevent default newline on Enter
            handleSendMessage();
        }
    }
}

function handleSendButtonClick() {
    handleSendMessage();
}


// --- File Handling Functions ---
function processSelectedFile(file) {
    if (!file) return false;

    const allowedImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
    const allowedPdfType = 'application/pdf';
    const isAllowedImage = allowedImageTypes.includes(file.type);
    const isAllowedPdf = file.type === allowedPdfType;

    if (!isAllowedImage && !isAllowedPdf) {
        showError(`Invalid file type. Please select an image (PNG, JPG, WebP) or a PDF.`);
        handleRemoveFile();
        return false;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        showError(`File is too large (Max ${MAX_FILE_SIZE_MB} MB).`);
        handleRemoveFile();
        return false;
    }

    hideError();
    const reader = new FileReader();
    reader.onload = (e) => {
        selectedFileBase64 = e.target.result; // Data URL
        selectedFile = file;

        if (isAllowedImage) {
            filePreviewImage.src = selectedFileBase64;
            filePreviewImage.classList.remove('hidden');
            filePreviewPdf.classList.add('hidden');
            console.log("Image processed:", file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        } else if (isAllowedPdf) {
            pdfFilenameSpan.textContent = file.name;
            filePreviewPdf.classList.remove('hidden');
            filePreviewImage.classList.add('hidden');
            filePreviewImage.src = '#';
            console.log("PDF processed:", file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        }

        filePreviewContainer.classList.remove('hidden');
        attachButton.classList.add('has-file');
    };
    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading file.");
        handleRemoveFile();
    };
    reader.readAsDataURL(file);
    return true;
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const processed = processSelectedFile(file);
    if (!processed) {
        resetFileInput();
    }
}

function handlePaste(event) {
    if (document.activeElement !== messageInput) return; // Only paste into input
    const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
                 // Check if type is allowed before processing fully
                 const allowedImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
                 const isAllowedImage = allowedImageTypes.includes(file.type);
                 const isAllowedPdf = file.type === 'application/pdf';

                 if(isAllowedImage || isAllowedPdf){
                    // We have a potentially valid file, try processing it
                    const processed = processSelectedFile(file); // This also performs size check
                    if (processed) {
                        event.preventDefault(); // Prevent default paste action ONLY if we successfully handle a file
                        console.log("File paste handled:", file.name);
                        break; // Handle only the first valid file found
                    } else {
                         // processSelectedFile failed (e.g., too large), maybe show error?
                         // Error is shown by processSelectedFile, so just log and continue checking other items.
                         console.log("Pasted file processing failed (check error message above).");
                    }
                 } else {
                     console.log("Pasted item is a file, but not an allowed type:", file.type);
                 }
            }
        }
    }
}

function handleRemoveFile() {
    selectedFile = null;
    selectedFileBase64 = null;
    filePreviewImage.src = '#';
    filePreviewImage.classList.add('hidden');
    pdfFilenameSpan.textContent = '';
    filePreviewPdf.classList.add('hidden');
    filePreviewContainer.classList.add('hidden');
    resetFileInput();
    attachButton.classList.remove('has-file');
    hideError();
    console.log("Selected file removed.");
}

function resetFileInput() {
    fileUploadInput.value = null; // Clear the selection in the input element
}
// --- END File Handling Functions ---


// --- Core Message Sending Logic ---
async function handleSendMessage() {
    const userMessageText = messageInput.value.trim();
    // Ensure there's either text or a file selected
    if (!userMessageText && !selectedFile) {
        console.log("Send ignored: No text or file.");
        return;
    }

    sendButton.disabled = true;
    hideError();
    showLoading();

    const messageParts = [];
    let fileDataForDisplay = null; // Store Data URL for display
    let fileNameForDisplay = null; // Store filename for display if PDF

    // --- Capture file data ---
    if (selectedFileBase64 && selectedFile) {
        messageParts.push({
            inlineData: {
                mimeType: selectedFile.type,
                data: selectedFileBase64 // Send the full Data URL
            }
        });
        fileDataForDisplay = selectedFileBase64; // For image display
        if (selectedFile.type === 'application/pdf') {
            fileNameForDisplay = selectedFile.name; // For PDF display
        }
        console.log(`Preparing message with file: ${selectedFile.name} (${selectedFile.type})`);
    }

    // --- Capture text data ---
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
        console.log("Preparing message with text:", userMessageText);
    }

    // --- Display User Message ---
    displayMessage('user', userMessageText || '', fileDataForDisplay, null, fileNameForDisplay);

    // --- Add to Client-Side History & Clear Inputs ---
    // IMPORTANT: Add the message with parts using the 'user' role.
    conversationHistory.push({ role: 'user', parts: messageParts });
    console.log("User message added to client history. Current history length:", conversationHistory.length);


    messageInput.value = ''; // Clear the text input
    handleRemoveFile();    // Clear the selected file and preview
    adjustTextareaHeight(); // Reset textarea height after clearing

    // Conditional Focus/Blur
    if (isMobileDevice()) {
        messageInput.blur();
    } else {
        messageInput.focus(); // Keep focus on desktop
    }

    // --- API Call Section ---
    try {
        // REMOVED: truncateHistory(); - Backend handles truncation now

        // Send the FULL client-side history
        const historyForThisRequest = [...conversationHistory];
        const payload = { history: historyForThisRequest }; // Send the entire history

        console.log(`Sending request to /api/chat with history length: ${historyForThisRequest.length}`);
        // console.log("Payload sample:", JSON.stringify(payload).substring(0, 200) + "..."); // Optional: Log snippet


        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        hideLoading(); // Hide loading once response starts coming back

        if (!response.ok) {
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try {
                const errorData = await response.json();
                 // Use the specific error message from the backend if available
                errorMsg = errorData.error || errorMsg;
                 // Handle specific status codes if needed (e.g., 413 Payload Too Large)
                 if (response.status === 413) {
                      errorMsg = `Request Failed: ${errorMsg}`; // Prepend context
                 } else if (response.status === 403) {
                      errorMsg = `Permissions Error: ${errorMsg}`;
                 }

            } catch (e) {
                console.warn("Could not parse API error response.");
                // Try to get raw text if JSON parsing fails
                 try {
                     const errorText = await response.text();
                     errorMsg += `\nResponse: ${errorText.substring(0, 100)}...`; // Add snippet of text response
                 } catch (textErr) {
                     // Ignore error getting text response
                 }
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml;
        const modelUsed = data.modelUsed;
        console.log(`AI Response received (using ${modelUsed || 'unknown model'})`);

        // Add AI response to client-side history
        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });
        console.log("AI message added to client history. Current history length:", conversationHistory.length);

        // Display AI response
        displayMessage('model', aiResponseText, null, searchSuggestionHtml, null); // 'model' role for AI

    } catch (err) {
        console.error("Error during send/receive:", err);
        showError(err.message || "Failed to get response.");
        hideLoading(); // Ensure loading is hidden on error

        // IMPORTANT: Decide how to handle history on failure.
        // Should we remove the user's last message from the client-side history if the API call failed?
        // This prevents the failed message from being resent, but also loses the user's input.
        // Let's remove it for now to avoid resending a potentially problematic message.
        if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'user') {
            conversationHistory.pop();
            console.warn("Removed last user message from client history due to API error.");
        }

    } finally {
        sendButton.disabled = false; // Re-enable send button
        // Focus is handled conditionally above
    }
    // --- END API Call Section ---
}
// --- END Core Message Sending Logic ---


// --- Display & Formatting ---
function displayMessage(role, text, fileDataUrl = null, searchSuggestionHtml = null, fileName = null) {
    const messageDiv = document.createElement('div');
    // Use 'ai-message' class for role 'model'
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    // --- Add Attachment Preview (for user messages only) ---
    if (role === 'user' && (fileDataUrl || fileName)) {
        const attachmentPreviewDiv = document.createElement('div');
        attachmentPreviewDiv.classList.add('attachment-preview');

        if (fileName) { // PDF
            const pdfInfoDiv = document.createElement('div');
            pdfInfoDiv.classList.add('pdf-info');
            pdfInfoDiv.innerHTML = `
                <span class="pdf-icon">📄</span>
                <span class="pdf-filename-display" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span>
            `; // Added title attribute for full name on hover
            attachmentPreviewDiv.appendChild(pdfInfoDiv);
        } else if (fileDataUrl) { // Image
            const imgElement = document.createElement('img');
            imgElement.classList.add('message-image');
            imgElement.src = fileDataUrl;
            imgElement.alt = "User uploaded image";
            // Optional: Add click to enlarge later
            attachmentPreviewDiv.appendChild(imgElement);
        }
        messageDiv.appendChild(attachmentPreviewDiv);
    }
    // --- End Attachment Preview ---

    // Add text element if provided
    if (text) {
        const paragraph = document.createElement('p');
        // Process AI text with Markdown & Sanitize
        // Use 'model' role check for AI message markdown processing
        if (role === 'model' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                marked.setOptions({ breaks: true, gfm: true });
                const rawHtml = marked.parse(text);
                const sanitizedHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }); // Ensure basic HTML is allowed
                paragraph.innerHTML = sanitizedHtml;
            } catch (error) {
                console.error("Markdown processing error:", error);
                paragraph.textContent = text; // Fallback to text
            }
        } else { // User text or AI text if libs are missing/role isn't model
            paragraph.textContent = text;
            // Ensure user message text preserves line breaks visually
             if (role === 'user') {
                 paragraph.style.whiteSpace = 'pre-wrap';
             }
        }
        // Only append if paragraph has actual content (even if just whitespace after trim)
        if (paragraph.innerHTML.trim() || paragraph.textContent.trim()) {
             messageDiv.appendChild(paragraph);
        }
    }

    // Add Google Search suggestions (for AI messages)
    // Use 'model' role check
    if (role === 'model' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container');
        try {
            // Directly inject Google's HTML
            suggestionContainer.innerHTML = searchSuggestionHtml;
            // Check if content was actually added
            if (suggestionContainer.innerHTML.trim()) {
                messageDiv.appendChild(suggestionContainer);
            } else {
                 console.warn("Search suggestion HTML was provided but resulted in empty container.");
            }
        } catch (error) {
            console.error("Error setting innerHTML for search suggestions:", error);
        }
    }

    // Append the message bubble to chat history
    chatHistory.appendChild(messageDiv);

    // Trigger scrolling behavior AFTER appending
    if (role === 'user') {
        scrollChatToBottom(); // Scroll fully down for user message
    } else if (role === 'model') {
        scrollToMessageTop(messageDiv); // Scroll to show the top of the new AI message
    }
}
// --- END Display & Formatting ---

// --- History Management ---
// REMOVED: truncateHistory() function is now obsolete.
// --- END History Management ---

// --- UI Utility Functions ---
function showLoading() { loadingIndicator.classList.remove('hidden'); }
function hideLoading() { loadingIndicator.classList.add('hidden'); }
function showError(message) {
    errorDisplay.textContent = message;
    errorDisplay.classList.remove('hidden');
    console.error("Displaying error:", message);
     // Optional: scroll to show the error if it's potentially off-screen
     errorDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideError() {
    errorDisplay.classList.add('hidden');
    errorDisplay.textContent = '';
}

// Simple HTML escaping function
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, """)
         .replace(/'/g, "'");
}
// --- END UI Utility Functions ---

// --- Initial Setup ---
messageInput.focus(); // Focus input on load
adjustTextareaHeight(); // Set initial height
console.log(`Kramer Intelligence script initialized. Max upload size: ${MAX_FILE_SIZE_MB}MB. History truncation and token counting handled by backend.`);
// --- END Initial Setup ---