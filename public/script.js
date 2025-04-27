// public/script.js

// Existing DOM element references
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
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
chatForm.addEventListener('submit', handleSendMessage);
attachButton.addEventListener('click', () => {
    resetFileInput(); // Clear the input before triggering click
    imageUploadInput.click();
});
imageUploadInput.addEventListener('change', handleFileSelect);
removeImageButton.addEventListener('click', handleRemoveImage);

// Add Paste Event Listener to the document
document.addEventListener('paste', handlePaste);
// --- End Event Listeners ---


// --- Functions ---

// --- Refactored File Processing Logic ---
function processSelectedFile(file) {
    if (!file) return false; // Exit if no file provided

    // Validate Type
    if (!file.type.startsWith('image/')) {
        showError('Pasted/Selected item is not a valid image file.');
        handleRemoveImage(); // Clear any previous selection state
        return false; // Indicate failure
    }

    // Validate Size
    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        showError(`Image size should not exceed ${MAX_IMAGE_SIZE_MB} MB.`);
        handleRemoveImage(); // Clear any previous selection state
        return false; // Indicate failure
    }

    // --- File is valid, proceed with reading and previewing ---
    hideError(); // Clear any previous error messages

    const reader = new FileReader();
    reader.onload = (e) => {
        selectedFileBase64 = e.target.result; // Store DataURL
        selectedFile = file; // Store the File object itself
        imagePreview.src = selectedFileBase64; // Update preview source
        imagePreviewContainer.classList.remove('hidden'); // Show preview area
        attachButton.classList.add('has-file'); // Update attach button style
        console.log("Image processed successfully:", file.name, file.type);
    };
    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading the image file.");
        handleRemoveImage(); // Clean up on error (resets state and hides preview)
    };
    reader.readAsDataURL(file); // Start reading the file as Data URL
    return true; // Indicate processing started (async)
}
// --- END Refactored File Processing Logic ---


// --- Handle File Selection via Input ---
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return; // No file selected

    // Attempt to process the selected file
    const processed = processSelectedFile(file);

    // If processing failed immediately (e.g., bad type/size), reset the input
    // so the user can potentially select the same file again if they fix the issue.
    if (!processed) {
        resetFileInput();
    }
    // If processing started (FileReader is async), don't reset input yet.
    // handleRemoveImage will reset it if the reader fails later or user removes manually.
}
// --- END Handle File Selection via Input ---


// --- Paste Handler (Checks for Focus) ---
function handlePaste(event) {
    // --- CHECK: Only proceed if message input has focus ---
    if (document.activeElement !== messageInput) {
        console.log("Paste event ignored: Message input does not have focus.");
        return; // Exit handler if the input is not focused
    }
    // --- END CHECK ---

    const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
    if (!items) {
        console.log("Paste event ignored: No clipboard items found.");
        return; // Exit if no clipboard data
    }

    console.log("Paste event detected while input focused."); // Log that the event is being processed

    let foundImage = false;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Check if it's a file AND specifically an image type
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const imageFile = item.getAsFile(); // Get the File object
            if (imageFile) {
                console.log("Image file found in clipboard:", imageFile.name, imageFile.type);
                // Process the file using the refactored function
                const processed = processSelectedFile(imageFile);
                if (processed) {
                    foundImage = true;
                    // Prevent the default paste action (e.g., pasting file path as text)
                    // ONLY if we successfully started processing an image.
                    event.preventDefault();
                    console.log("Image paste handled, default paste prevented.");
                    // Handle only the first image found in the paste items
                    break;
                } else {
                    console.log("Image processing failed (validation or reader error).");
                    // Do not prevent default if processing fails, allow potential text paste.
                }
            }
        } else {
           // Optional: Log skipped items for debugging
           // console.log(`Clipboard item ${i}: kind='${item.kind}', type='${item.type}' (skipped)`);
        }
    }

    if (!foundImage) {
        console.log("Paste event did not contain a handleable image file, allowing default paste behavior (e.g., pasting text).");
        // If no image was successfully handled, let the default paste behavior occur
        // (e.g., pasting text into the input field).
    }
}
// --- END Paste Handler ---


// --- Handle Manual Removal of Image ---
function handleRemoveImage() {
    // Reset state variables
    selectedFile = null;
    selectedFileBase64 = null;

    // Reset preview UI
    imagePreview.src = '#'; // Clear preview image source
    imagePreviewContainer.classList.add('hidden'); // Hide preview area

    // Reset file input element
    resetFileInput();

    // Reset attach button style
    attachButton.classList.remove('has-file');

    // Hide any potentially related error messages
    hideError();

    console.log("Selected image removed and state reset.");
}
// --- END Handle Manual Removal of Image ---


// --- Utility to Reset File Input ---
function resetFileInput() {
    // Resetting the input value allows selecting the same file again if needed
    imageUploadInput.value = null;
}
// --- END Utility to Reset File Input ---


// --- Handle Sending Message (Text and/or Image) ---
async function handleSendMessage(event) {
    event.preventDefault(); // Prevent default form submission
    const userMessageText = messageInput.value.trim();

    // Ensure there's either text or an image to send
    if (!userMessageText && !selectedFileBase64) {
        console.log("Send ignored: No text or image selected.");
        return; // Nothing to send
    }

    // Disable send button, hide errors, show loading indicator
    sendButton.disabled = true;
    hideError();
    showLoading();

    // Prepare parts for the API request
    const messageParts = [];
    let currentImageDataUrl = null; // For displaying the image in the user's own message bubble

    // Add image part if one is selected
    if (selectedFileBase64 && selectedFile) {
        // The API expects only the Base64 data, not the full DataURL prefix
        // Let the backend handle extraction if needed, or adjust here if backend expects prefix removed.
        // Assuming backend's getBase64Data handles the DataURL:
        messageParts.push({
            inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 }
        });
        currentImageDataUrl = selectedFileBase64; // Use the full DataURL for local display
        console.log("Adding image part to request:", selectedFile.name);
    }

    // Add text part if text exists
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
        console.log("Adding text part to request:", userMessageText);
    }

    // Display the user's message immediately in the chat history
    displayMessage('user', userMessageText || '', currentImageDataUrl); // Pass base64 for display
    scrollChatToBottom();

    // Add the complete user message (with parts) to the internal conversation history
    conversationHistory.push({ role: 'user', parts: messageParts });

    // Clear the text input and reset the image selection state *after* processing
    messageInput.value = '';
    handleRemoveImage(); // This resets selectedFile, selectedFileBase64, preview, input, etc.

    messageInput.focus(); // Keep focus on the input field for convenience

    // --- API Call Section ---
    try {
        truncateHistory(); // Trim history before sending if needed
        const historyForThisRequest = [...conversationHistory]; // Send a copy of the current history
        const payload = { history: historyForThisRequest };
        // Avoid logging potentially large base64 data fully in production
        console.log("Sending payload to /api/chat:", JSON.stringify(payload, (key, value) => key === 'data' && typeof value === 'string' && value.length > 100 ? value.substring(0, 100) + '...' : value , 2));

        // Make the API call to the backend serverless function
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        hideLoading(); // Hide loading indicator regardless of success/failure

        // Check if the API call was successful
        if (!response.ok) {
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try {
                // Try to parse error details from the response body
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg; // Use specific error if available
            } catch (e) {
                // If parsing fails, the body might not be JSON
                console.warn("Could not parse error JSON from API response.");
            }
            throw new Error(errorMsg); // Throw error to be caught by the catch block
        }

        // Parse the successful JSON response
        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml;
        const modelUsed = data.modelUsed; // Get model used from response (if backend includes it)

        console.log(`AI Response received (using ${modelUsed || 'unknown model'}):`, aiResponseText?.substring(0, 100) + "...");
        if(searchSuggestionHtml) console.log("Search suggestion HTML present.");

        // Add the AI's response to the internal conversation history
        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });

        // Display the AI's response in the chat history
        displayMessage('ai', aiResponseText, null, searchSuggestionHtml);
        scrollChatToBottom();

    } catch (err) {
        // Handle errors from the fetch call or response processing
        console.error("Error during send/receive:", err);
        showError(err.message || "Failed to get response from AI. Please try again.");
        // Consider what state the UI should be in after an error.
        // Currently, the user message is displayed, but the AI response fails.
        hideLoading(); // Ensure loading is hidden on error too
    } finally {
        // Re-enable the send button in all cases (success or error)
        sendButton.disabled = false;
    }
    // --- END API Call Section ---
}
// --- END Handle Sending Message ---


// --- Display Message in Chat History ---
function displayMessage(role, text, imageDataUrl = null, searchSuggestionHtml = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    // Display image if provided (typically for user messages)
    if (imageDataUrl && role === 'user') {
        const imgElement = document.createElement('img');
        imgElement.classList.add('message-image');
        imgElement.src = imageDataUrl;
        imgElement.alt = "User uploaded image";
        // Optional: Add click handler for modal/enlargement
        // imgElement.onclick = () => { /* open modal */ };
        messageDiv.appendChild(imgElement);
    }

    // Display text if provided
    if (text) {
        const paragraph = document.createElement('p');
        // Process AI messages as Markdown, user messages as plain text
        if (role === 'ai' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                // Configure marked (ensure options are set as desired)
                marked.setOptions({
                    breaks: true, // Convert single line breaks (\n) to <br>
                    gfm: true,    // Enable GitHub Flavored Markdown tables, strikethrough etc.
                });
                // 1. Parse Markdown to potentially unsafe HTML
                const rawHtml = marked.parse(text);
                // 2. Sanitize the generated HTML to prevent XSS attacks
                const sanitizedHtml = DOMPurify.sanitize(rawHtml);
                paragraph.innerHTML = sanitizedHtml; // Set sanitized HTML
            } catch (error) {
                console.error("Error parsing or sanitizing Markdown:", error);
                paragraph.textContent = text; // Fallback to plain text on error
            }
        } else {
            // For user messages or if Markdown libraries fail/are missing
            paragraph.textContent = text;
        }
        messageDiv.appendChild(paragraph);
    }

     // Display search suggestions if provided (only for AI messages)
    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container');
        // Sanitize the externally provided HTML snippet for safety
        if (typeof DOMPurify !== 'undefined') {
            // Use DOMPurify to clean the HTML received from the API
            suggestionContainer.innerHTML = DOMPurify.sanitize(searchSuggestionHtml);
        } else {
            // Security Risk: Avoid rendering untrusted HTML without sanitization
            console.warn("DOMPurify not loaded. Cannot safely display search suggestions HTML.");
            // Optionally display a placeholder text:
            // const placeholder = document.createElement('span');
            // placeholder.textContent = "[Search suggestions available but cannot be displayed securely]";
            // placeholder.style.fontSize = '0.8em';
            // placeholder.style.opacity = '0.7';
            // suggestionContainer.appendChild(placeholder);
        }
        // Append only if sanitization was successful OR if DOMPurify is missing
        // (and you accept the risk or have other controls)
        if (suggestionContainer.innerHTML) { // Check if content exists after sanitization
           messageDiv.appendChild(suggestionContainer);
        }
    }

    // Add the complete message bubble to the chat history container
    chatHistory.appendChild(messageDiv);
}
// --- END Display Message in Chat History ---


// --- Truncate History if it Exceeds Limit ---
function truncateHistory() {
    let totalChars = 0;
    // Calculate current estimated size
    for (const message of conversationHistory) {
        if (message.parts && Array.isArray(message.parts)) {
            for (const part of message.parts) {
                if (part.text) {
                    totalChars += part.text.length;
                } else if (part.inlineData) {
                    // Use the defined constant for image size estimation
                    totalChars += IMAGE_CHAR_EQUIVALENT;
                }
            }
        }
    }
    console.log(`Current history size: ~${totalChars} estimated chars (Limit: ${MAX_HISTORY_CHARS})`);

    // Truncate if over limit (remove oldest user/model pair)
    // Ensure we always remove pairs (user + model) to keep conversation flow logical
    while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length >= 2) {
        console.log(`History limit exceeded (${totalChars}/${MAX_HISTORY_CHARS}). Truncating oldest pair...`);
        const removedUserMsg = conversationHistory.shift(); // Remove oldest (user)
        const removedModelMsg = conversationHistory.shift(); // Remove next oldest (model)
        let removedChars = 0;

        // Recalculate removed characters accurately based on the removed messages
        [removedUserMsg, removedModelMsg].forEach(msg => {
             if (msg?.parts && Array.isArray(msg.parts)) {
                msg.parts.forEach(part => {
                    if (part.text) removedChars += part.text.length;
                    else if (part.inlineData) removedChars += IMAGE_CHAR_EQUIVALENT;
                });
            }
        });

        totalChars -= removedChars; // Update total count
        console.log(`Removed oldest pair (estimated ${removedChars} chars). New char count: ~${totalChars}`);
    }
}
// --- END Truncate History ---


// --- UI Utility Functions ---
function scrollChatToBottom() {
    // Use setTimeout to ensure the scroll happens after the DOM update
    setTimeout(() => {
        const chatContainer = document.getElementById('chat-container');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50); // A small delay (e.g., 50ms) often helps
}

function showLoading() {
    loadingIndicator.classList.remove('hidden');
}

function hideLoading() {
    loadingIndicator.classList.add('hidden');
}

function showError(message) {
    errorDisplay.textContent = message;
    errorDisplay.classList.remove('hidden');
    // Keep error visible until next action or manual clear (e.g., removing image)
    console.error("Displaying error to user:", message);
    // Optional: auto-hide after a delay
    // setTimeout(hideError, 7000);
}

function hideError() {
    errorDisplay.classList.add('hidden');
    errorDisplay.textContent = ''; // Clear the text
}
// --- END UI Utility Functions ---


// --- Initial Setup ---
messageInput.focus(); // Focus the input field when the page loads
console.log("Kramer Intelligence script initialized successfully.");
// --- END Initial Setup ---