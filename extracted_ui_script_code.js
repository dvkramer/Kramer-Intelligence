// Extracted code from public/script.js

// --- DOM element references ---
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input'); // Textarea
const sendButton = document.getElementById('send-button');
const chatHistory = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading');
const errorDisplay = document.getElementById('error');
const attachButton = document.getElementById('attach-button');
const fileUploadInput = document.getElementById('file-upload-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageButton = document.getElementById('remove-image-button');
// const mainContentArea = document.getElementById('main-content-area'); // Not directly part of data flow to/from API
const pdfFilenamePreview = document.getElementById('pdf-filename-preview');

// --- Configuration ---
const MAX_FILE_SIZE_MB = 15; // Matches backend limit, relevant for preparing file data

// --- State Variables (Used to prepare payload for /api/chat) ---
let conversationHistory = []; // Core data sent to the backend
let selectedFile = null; // Holds the File object
let selectedFileType = null; // 'image' or 'pdf', used in constructing payload
let selectedFileBase64 = null; // Base64 data URL, sent in payload to backend

// --- Event Listeners (Trigger functions that prepare and send data) ---
/*
messageInput.addEventListener('keydown', handleInputKeyDown); // Triggers handleSendMessage
sendButton.addEventListener('click', handleSendButtonClick); // Triggers handleSendMessage
attachButton.addEventListener('click', () => { // Opens file dialog
    resetFileInput();
    fileUploadInput.click();
});
fileUploadInput.addEventListener('change', handleFileSelect); // Processes selected file
removeImageButton.addEventListener('click', handleRemoveFile); // Clears selected file
document.addEventListener('paste', handlePaste); // Can trigger file processing
// messageInput.addEventListener('input', adjustTextareaHeight); // UI only
*/

// --- File Handling Functions (Prepare file data for the payload) ---

// processSelectedFile: Reads file, converts to base64 (selectedFileBase64), sets selectedFileType.
// This data is then used in handleSendMessage to build the payload for /api/chat.
/*
function processSelectedFile(file) {
    // ... (validation: type, size)
    // reader.onload = (e) => {
    //     selectedFileBase64 = e.target.result; // Data URL (image or PDF) - THIS IS SENT TO BACKEND
    //     selectedFile = file;
    //     selectedFileType = isImage ? 'image' : 'pdf'; // Used to structure payload potentially
    // ...
    // reader.readAsDataURL(file);
    // ...
}
*/

// handleFileSelect: Triggered by file input change, calls processSelectedFile.
/*
function handleFileSelect(event) {
    // const file = event.target.files[0];
    // processSelectedFile(file);
    // ...
}
*/

// handlePaste: Handles pasting files, calls processSelectedFile.
/*
function handlePaste(event) {
    // ...
    // if (item.kind === 'file' && item.type.startsWith('image/')) {
    //     const imageFile = item.getAsFile();
    //     processSelectedFile(imageFile);
    // ...
}
*/

// handleRemoveFile: Clears selectedFileBase64, selectedFile, selectedFileType.
/*
function handleRemoveFile() {
    selectedFile = null;
    selectedFileBase64 = null;
    selectedFileType = null;
    // ... (UI updates)
}
*/

// resetFileInput: Clears the file input element.
/*
function resetFileInput() {
    // fileUploadInput.value = null;
}
*/
// --- END File Handling Functions ---


// --- Core Message Sending Logic ---

// _sendMessageToServer: Sends conversationHistory (including any file data prepared by file handlers)
// to the /api/chat backend. Consumes response from backend.
async function _sendMessageToServer(historyToProcess) {
    // showLoading(); // UI utility
    try {
        // payload construction: historyToProcess contains user messages and potentially base64 file data
        const payload = { history: [...historyToProcess] };
        // console.log("Sending payload to /api/chat:", { historyLength: payload.history.length });

        const response = await fetch('/api/chat', { // API call to backend
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        // ... (Error handling for the fetch call)

        const data = await response.json(); // Consumes data from backend
        const aiResponseText = data.text;   // AI text from backend (ultimately from Gemini)
        const searchSuggestionHtml = data.searchSuggestionHtml; // Search suggestions from backend (from Gemini)
        // console.log(`AI Response received (using ${data.modelUsed || 'unknown model'})`);

        // const aiMessageId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        // Update global conversationHistory with AI response
        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }], id: aiMessageId });
        // displayMessage('ai', aiResponseText, null, searchSuggestionHtml, aiMessageId); // Displays AI response

    } catch (err) {
        // console.error("Error during send/receive:", err);
        // showError(err.message || "Failed to get response."); // UI utility
    } finally {
        // hideLoading(); // UI utility
        // sendButton.disabled = false; // UI update
    }
}

// handleSendMessage: Orchestrates message sending. It prepares the 'parts' array
// (including text and/or inlineData with base64 encoded file) from user input and selected file state.
// This becomes part of the conversationHistory sent to _sendMessageToServer.
async function handleSendMessage() {
    // const userMessageText = messageInput.value.trim();
    // if (!userMessageText && !selectedFile) return;

    // ... (UI updates)

    const messageParts = []; // This will be part of the payload
    // let fileInfoForDisplay = null; // For UI

    if (selectedFileBase64 && selectedFile && selectedFileType) {
        messageParts.push({ // Prepares file data for the payload
            inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 }
        });
        // ... (fileInfoForDisplay setup for UI)
    }
    if (userMessageText) {
        messageParts.push({ text: userMessageText }); // Prepares text data for the payload
    }

    // ... (Return if messageParts is empty)

    // const userMessageId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    // Update global conversationHistory with user message (including file data if any)
    conversationHistory.push({ role: 'user', parts: messageParts, id: userMessageId });
    // displayMessage('user', userMessageText || '', fileInfoForDisplay, null, userMessageId); // Displays user message

    // ... (UI cleanup: clear input, remove file selection)

    await _sendMessageToServer(conversationHistory); // Calls the function that sends data to backend
}
// --- END Core Message Sending Logic ---


// --- Display & Formatting ---
// displayMessage: Renders messages to the DOM. For AI messages, it displays text and search suggestions
// received from the backend (which are from Gemini). For user messages, it shows text and previews of uploaded files.
function displayMessage(role, text, fileInfo = null, searchSuggestionHtml = null, messageId) {
    // ... (DOM element creation)

    if (fileInfo && role === 'user') { // Displays user-uploaded file previews
        // ... (image or PDF preview logic)
    }

    if (text) { // Displays text (user's or AI's)
        // const paragraph = document.createElement('p');
        if (role === 'ai' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            // Markdown processing for AI text (consumed from backend)
            // ...
        } else {
            // paragraph.textContent = text;
        }
        // ...
    }

    if (role === 'ai' && searchSuggestionHtml) { // Displays search suggestions (consumed from backend)
        // const suggestionContainer = document.createElement('div');
        // suggestionContainer.innerHTML = searchSuggestionHtml; // searchSuggestionHtml is from backend
        // ...
    }

    // ... (Action buttons: edit, regenerate - these can trigger new calls to _sendMessageToServer)
    // ... (Appending to chatHistory and scrolling)
}
// --- END Display & Formatting ---

// --- UI Utility Functions (Show/hide loading and errors related to API calls) ---
function showLoading() { loadingIndicator.classList.remove('hidden'); }
function hideLoading() { loadingIndicator.classList.add('hidden'); }
function showError(message) { errorDisplay.textContent = message; errorDisplay.classList.remove('hidden'); /* ... */ }
function hideError() { errorDisplay.classList.add('hidden'); errorDisplay.textContent = ''; }
// --- END UI Utility Functions ---

// End of extracted code
// Note: Comments are used to denote where some original logic (like DOM manipulations within functions)
// has been summarized for brevity, focusing on the data flow relevant to API interaction.
// Full functions were present in the original script.
// Parts preparing data FOR /api/chat:
// - `selectedFileBase64`, `selectedFile.type` (within `messageParts` in `handleSendMessage`)
// - `userMessageText` (within `messageParts` in `handleSendMessage`)
// - `conversationHistory` (as a whole, passed to `_sendMessageToServer` and then in `payload`)
// Parts consuming data FROM /api/chat (which gets it from Gemini):
// - `data.text` (AI response, in `_sendMessageToServer`, passed to `displayMessage`)
// - `data.searchSuggestionHtml` (in `_sendMessageToServer`, passed to `displayMessage`)
// - `data.modelUsed` (logging purposes)
