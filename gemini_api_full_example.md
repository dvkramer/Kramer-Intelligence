# Gemini API Usage Example: Full Stack

## 1. Introduction

This file contains code excerpts demonstrating a full-stack example of using the Google Gemini API. It covers:
- **Backend (`api/chat.js`):** A Node.js serverless function that handles API calls to Gemini, including authentication, request formatting, and response processing.
- **Frontend JavaScript (`public/script.js`):** Client-side JavaScript that manages user interactions, file uploads, constructs requests to the backend, and displays responses.
- **HTML Structure (`public/index.html`):** The basic HTML layout for the chat interface.

These components work together to create a functional chat application powered by the Gemini API.

## 2. Backend Code (`api/chat.js`)

This script is a serverless function (e.g., for Vercel) that acts as a proxy between the frontend and the Google Gemini API. It handles:
- Receiving chat history (including text and file data) from the frontend.
- Authenticating with the Gemini API using an API key.
- Formatting the request payload according to the Gemini API's requirements.
- Performing token counting and history truncation if necessary.
- Sending the request to the Gemini API (trying multiple models if specified).
- Processing the API's response (text, search suggestions, errors) and sending it back to the frontend.

```javascript
// Extracted code from api/chat.js

// --- Helper function ---
// Used for processing inline image data for the API request
function getBase64Data(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
        console.error("Invalid Data URL format received:", dataUrl);
        return null; // Or throw an error
    }
    return dataUrl.split(',')[1];
}

// --- Configuration (Directly configures API interaction parameters) ---
const MODELS_TO_TRY = [
	'gemini-2.5-flash',
	'gemini-2.5-flash-lite-preview-06-17'
]; // Models to attempt for the API call
const MAX_FILE_SIZE_MB = 15; // Max size for inline upload (Indirectly affects API by limiting what can be sent)
const MAX_TOKENS = 1000000; // Max context window tokens (Used for pre-API call truncation)

// --- API Key Handling (Essential for authenticating API calls) ---
// const apiKey = process.env.GEMINI_API_KEY; // This line is executed within the handler
/* Relevant check:
    if (!apiKey) {
        console.error("GEMINI_API_KEY missing.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }
*/

// --- Request Payload Construction (Prepares data for the Gemini API) ---
/* Relevant history processing:
    const processedContents = history.map(message => {
        // ... (maps client-side history to Gemini API format)
        const processedParts = message.parts.map(part => {
            if (part.text) {
                return { text: part.text };
            } else if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
                const base64Data = getBase64Data(part.inlineData.data); // Uses helper
                // ...
                return {
                    inlineData: {
                        mimeType: part.inlineData.mimeType,
                        data: base64Data
                    }
                };
            } // ...
        }).filter(part => part !== null);
        // ...
    }).filter(content => content !== null);
*/

/* Relevant system prompt generation:
    const baseSystemPrompt = "You are Kramer Intelligence, an advanced AI assistant developed by Daniel Vincent Kramer. Kramer Intelligence may be abbreviated as KI.";
    const today = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = today.toLocaleDateString('en-US', dateOptions);
    const systemPrompt = `${baseSystemPrompt} Today's date is ${formattedDate}.`;
*/

/* Token Counting and Truncation (Prepares data for Gemini API by ensuring it fits token limits)
    // ...
            const firstModel = MODELS_TO_TRY[0];
            const countTokensUrl = `https://generativelanguage.googleapis.com/v1beta/models/${firstModel}:countTokens?key=${apiKey}`; // API call for token count
            // ...
            const countResponse = await fetch(countTokensUrl, { // API call execution
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: contentsToCount }),
            });
    // ...
*/

/* Request body for generateContent:
        const requestBody = {
            contents: processedContents, // Processed history
            system_instruction: { parts: [ { text: systemPrompt } ] }, // System prompt
            tools: [ { googleSearch: {} } ]
            // Add safetySettings etc. here directly if needed
        };
*/

// --- API Call Execution (Directly calls the Gemini API) ---
/*
    for (const modelName of MODELS_TO_TRY) { // Loop to try defined models
        // ...
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`; // API URL construction

        // ...
        googleResponse = await fetch(apiUrl, { // The actual fetch call to Gemini API
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody), // Contains processed history and system prompt
        });
        // ...
    }
*/

// --- Response Handling (Processes the Gemini API's response) ---
/*
            if (googleResponse.ok) {
                googleData = await googleResponse.json(); // Parsing successful JSON response
                successfulModel = modelName;
                // ...
                break;
            } else {
                // API returned an error status (e.g., 4xx, 5xx)
                lastErrorData = await googleResponse.json(); // Parsing error JSON response
                // ...
            }
        } catch (error) { // Network or other fetch errors
            lastErrorData = { error: { message: `Network or fetch error for ${modelName}: ${error.message}` } };
            // ...
        }
    // ...
    if (!googleData || !successfulModel) { // Handling case where all model attempts failed
        // ... error reporting ...
    }

    // --- SUCCESS: Proceed with processing the successful response ---
    let aiText = null;
    const candidate = googleData?.candidates?.[0]; // Accessing the candidate from API response
    const promptFeedback = googleData?.promptFeedback; // Accessing prompt feedback for safety checks

    if (candidate) {
        const finalAnswerPart = candidate.content?.parts?.find(part => part.text && !part.thought);
        aiText = finalAnswerPart?.text; // Extracting text output

        const groundingMetadata = candidate.groundingMetadata;
        if (groundingMetadata?.searchEntryPoint?.renderedContent) {
            searchSuggestionHtml = groundingMetadata.searchEntryPoint.renderedContent; // Extracting search suggestions
        }
    }

    // Safety checks based on API response
    if (promptFeedback?.blockReason) {
        // ...
    }
    if (candidate?.finishReason === 'SAFETY') {
        // ...
    }

    // Validating AI response format
    if (typeof aiText !== 'string') {
        // ... error handling and reporting ...
    }

    // --- Send successful response back to client ---
    res.status(200).json({
        text: aiText,
        searchSuggestionHtml: searchSuggestionHtml,
        modelUsed: successfulModel
    });
*/

// --- Error Handling (Specific error message construction based on API response) ---
/* Included in Response Handling above, but some specific snippets:
    if (lastErrorData?.error?.status === 'FAILED_PRECONDITION') errorMsg += ' (Check API key/billing?)';
    if (lastErrorData?.error?.message?.includes('payload is too large')) errorMsg = `Request too large (~${MAX_FILE_SIZE_MB}MB limit).`;
    else if (lastErrorData?.error?.message?.includes('429')) errorMsg += ' (Rate limit exceeded?)';
    else if (lastErrorData?.error?.code === 400 && lastErrorData?.error?.message?.includes('must be less than or equal to')) errorMsg = `Request failed: History likely exceeds token limit. ${lastErrorData?.error?.message}`;
*/
// End of extracted code
```

## 3. Frontend JavaScript (`public/script.js`)

This script manages the client-side logic of the chat application. Its responsibilities include:
- Handling user input (text and file attachments).
- Reading and processing selected files (images, PDFs) into Base64 format.
- Constructing the payload (chat history, file data) to be sent to the backend (`/api/chat`).
- Making `fetch` requests to the backend.
- Displaying user messages and AI responses (including Markdown rendering and image/PDF previews) in the chat interface.
- Managing UI elements like loading indicators and error messages.

```javascript
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
```

## 4. HTML Structure (`public/index.html`)

This is the basic HTML structure for the chat application's frontend. It includes:
- A container for chat messages (`<div id="chat-history">`).
- Elements for loading indicators and error messages.
- An area for previewing attached files (images or PDF icons/filenames).
- The main input form with a textarea, file attachment button, and send button.
- Script tags to load necessary client-side libraries (like `marked` for Markdown and `DOMPurify` for sanitization) and the main `script.js`.

```html
<!-- Extracted HTML structures from public/index.html -->

<!-- Main container for chat messages -->
<!-- Manipulated by `displayMessage` in script.js to add new user and AI message bubbles. -->
<div id="chat-history">
    <!-- Chat messages will appear here -->
</div>

<!-- Loading indicator -->
<!-- Visibility toggled by `showLoading()` and `hideLoading()` in script.js during API calls. -->
<div id="loading" class="hidden">Thinking...</div>

<!-- Error display area -->
<!-- Content and visibility managed by `showError()` and `hideError()` in script.js. -->
<div id="error" class="hidden"></div>

<!-- File preview area -->
<!-- Visibility and content (image src, PDF filename) managed by `processSelectedFile` and `handleRemoveFile` in script.js. -->
<div id="image-preview-container" class="hidden">
    <div>  <!-- Inner div for positioning -->
         <!-- `src` attribute set by `processSelectedFile` for image previews or PDF icon. -->
         <img id="image-preview" src="#" alt="File preview"/>
         <!-- Text content set by `processSelectedFile` for PDF filenames. -->
         <span id="pdf-filename-preview"></span>
         <!-- `click` event handled by `handleRemoveFile` in script.js. -->
         <button id="remove-image-button" title="Remove file">×</button>
    </div>
</div>

<!-- Input form for sending messages and attaching files -->
<!-- `submit` event on this form is (implicitly) handled by `handleSendMessage` via `sendButton` click or Enter key in `messageInput`. -->
<form id="chat-form">
    <!-- File input, hidden. `change` event handled by `handleFileSelect` in script.js. Click triggered by `attachButton`. -->
    <input type="file" id="file-upload-input" accept="image/png, image/jpeg, image/webp, image/heic, image/heif, application/pdf" style="display: none;">

    <!-- Attach button. `click` event triggers `fileUploadInput.click()` in script.js. -->
    <button type="button" id="attach-button" title="Attach Image or PDF">
        📎
    </button>

    <!-- Message textarea. Value read by `handleSendMessage`. `keydown` (Enter) and `input` events handled in script.js. -->
    <textarea id="message-input" placeholder="Ask me anything..." rows="1" autocomplete="off"></textarea>

    <!-- Send button. `click` event handled by `handleSendButtonClick` (which calls `handleSendMessage`) in script.js. -->
    <button type="submit" id="send-button">Send</button>
</form>

<!-- Script tags for Markdown and DOMPurify -->
<!-- Used by `displayMessage` in script.js to render AI responses safely. -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@latest/dist/purify.min.js" defer></script>

<!-- Main application script -->
<!-- <script src="script.js" defer></script> -->
<!-- This loads the script.js file, which contains all the client-side logic interacting with the above elements. -->
```

## 5. Setup and Usage Notes

-   **Component Interaction:**
    -   The user interacts with the HTML page (`index.html`).
    -   `script.js` captures user input (text, files), sends it to `/api/chat`.
    -   `chat.js` (backend) receives this request, calls the Gemini API, and returns the response.
    -   `script.js` receives the backend response and updates the HTML to display the AI's message.
-   **API Key:**
    -   The backend script (`api/chat.js`) requires a Google Gemini API key.
    -   This key should be stored in an environment variable named `GEMINI_API_KEY`. If deploying to a platform like Vercel, this would be set in the project's environment variable settings. For local development, a `.env` file at the project root (or where the Node.js process is started) with the line `GEMINI_API_KEY=your_api_key_here` would typically be used (though the example `api/chat.js` directly uses `process.env.GEMINI_API_KEY`).
-   **Serverless Environment:**
    -   The `api/chat.js` script is designed to be deployed as a serverless function (e.g., on Vercel, AWS Lambda, Google Cloud Functions). The `export default async function handler(req, res)` is a common pattern for such environments.
-   **External Libraries:**
    -   The frontend uses `marked.min.js` for rendering Markdown content from the AI.
    -   It also uses `purify.min.js` (DOMPurify) to sanitize the HTML generated from Markdown, preventing XSS vulnerabilities.
    -   These are typically included via CDN links in the `index.html` file as shown, or they could be bundled if using a more complex frontend build process.
-   **File Paths:**
    -   The example assumes `api/chat.js` is in an `api` directory, and `index.html` and `script.js` are in a `public` directory, which is a common structure for projects deployed on platforms like Vercel.
    -   The `fetch` call in `script.js` to `/api/chat` relies on the hosting platform routing requests to the serverless function.
