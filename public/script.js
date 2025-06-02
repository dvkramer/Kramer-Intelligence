// public/script.js

// DOM element references
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
const mainContentArea = document.getElementById('main-content-area');
// <<< NEW DOM REFERENCE >>>
const pdfFilenamePreview = document.getElementById('pdf-filename-preview');

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
    fileUploadInput.click();
});
fileUploadInput.addEventListener('change', handleFileSelect);
removeImageButton.addEventListener('click', handleRemoveFile);
document.addEventListener('paste', handlePaste);
messageInput.addEventListener('input', adjustTextareaHeight);
// --- END Event Listeners ---


// --- Functions ---

// --- Mobile Detection Helper ---
function isMobileDevice() {
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
    const isLikelyMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return hasTouch && isLikelyMobileUA;
}
// --- END Mobile Detection Helper ---


// --- Textarea Height Adjustment ---
function adjustTextareaHeight() {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${messageInput.scrollHeight + 2}px`;
}

// --- Scrolling Functions ---
function scrollChatToBottom() {
    requestAnimationFrame(() => {
        mainContentArea.scrollTo({ top: mainContentArea.scrollHeight, behavior: 'smooth' });
    });
}

function scrollToMessageTop(messageElement) {
    const initialScrollTop = mainContentArea.scrollTop;
    const initialScrollHeight = mainContentArea.scrollHeight;
    const clientHeight = mainContentArea.clientHeight;
    const isNearBottomInitially = (initialScrollHeight - initialScrollTop - clientHeight) < 50;

    requestAnimationFrame(() => {
        const currentScrollTop = mainContentArea.scrollTop;
        if (isNearBottomInitially && currentScrollTop > initialScrollTop + 10) {
             console.log(`Scroll jumped down from ${initialScrollTop} to ${currentScrollTop} after adding AI message. Resetting.`);
             mainContentArea.scrollTop = initialScrollTop;
        }
        requestAnimationFrame(() => {
            const messageTopOffset = messageElement.offsetTop;
            let desiredScrollTop = Math.max(0, messageTopOffset - SCROLL_PADDING_TOP);
            const messageBottomOffset = messageTopOffset + messageElement.offsetHeight;
            const currentViewBottom = mainContentArea.scrollTop + mainContentArea.clientHeight;

            if (!(messageTopOffset >= mainContentArea.scrollTop && messageBottomOffset <= currentViewBottom)) {
                mainContentArea.scrollTo({ top: desiredScrollTop, behavior: 'smooth' });
            }
        });
    });
}
// --- END Scrolling Functions ---

// --- Input Handling ---
function handleInputKeyDown(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSendMessage(); } }
function handleSendButtonClick() { handleSendMessage(); }
// --- END Input Handling ---

// --- File Handling Functions ---

// **************************************************
// START MODIFIED SECTION for processSelectedFile
// **************************************************
function processSelectedFile(file) {
    if (!file) return false;

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
        showError('Invalid file type. Please select an image (PNG, JPG, WEBP, HEIC, HEIF) or a PDF.');
        handleRemoveFile();
        return false;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        showError(`File is too large (> ${MAX_FILE_SIZE_MB} MB). Max size for direct upload is limited.`);
        handleRemoveFile();
        return false;
    }

    hideError();
    const reader = new FileReader();

    reader.onload = (e) => {
        selectedFileBase64 = e.target.result; // Data URL (image or PDF)
        selectedFile = file;
        selectedFileType = isImage ? 'image' : 'pdf';

        // --- MINIMAL CHANGE V3 START (Icon + Filename) ---
        // Use the red-accented SVG Data URL for PDF icon
        const pdfSvgDataUrl = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%20width%3D%2264%22%20height%3D%2264%22%3E%3Cpath%20fill%3D%22%23E2E2E2%22%20d%3D%22M12%200%20H44%20L56%2012%20V60%20H12%20Z%22%2F%3E%3Cpath%20fill%3D%22%23CFCFCF%22%20d%3D%22M44%200%20L56%2012%20H44%20Z%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2275%25%22%20font-family%3D%22sans-serif%22%20font-size%3D%2214%22%20fill%3D%22%23D93025%22%20text-anchor%3D%22middle%22%20font-weight%3D%22bold%22%3EPDF%3C%2Ftext%3E%3C%2Fsvg%3E';

        // Configure the preview based on type
        if (isImage) {
            imagePreview.src = selectedFileBase64; // Show actual image data URL
            imagePreview.alt = `Image Preview: ${file.name}`;
            imagePreview.title = `Selected Image: ${file.name}`;
            pdfFilenamePreview.textContent = ''; // Clear filename text
            pdfFilenamePreview.style.display = 'none'; // Hide filename element
        } else { // For PDF
            imagePreview.src = pdfSvgDataUrl; // <<< USE SVG DATA URL
            imagePreview.alt = `PDF Icon: ${file.name}`;
            imagePreview.title = `Selected PDF: ${file.name}`;
            pdfFilenamePreview.textContent = file.name; // <<< SET Filename text
            pdfFilenamePreview.style.display = 'inline'; // <<< SHOW Filename element (CSS handles layout)
        }

        // Common UI updates: Show the preview container and update attach button
        imagePreviewContainer.classList.remove('hidden');
        attachButton.classList.add('has-file');
        // --- MINIMAL CHANGE V3 END ---

        console.log(`${selectedFileType.toUpperCase()} processed: ${file.name}`);
    };

    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        showError("Error reading the selected file.");
        handleRemoveFile();
    };

    reader.readAsDataURL(file);
    return true;
}
// **************************************************
// END MODIFIED SECTION for processSelectedFile
// **************************************************


function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const processed = processSelectedFile(file);
    if (!processed) {
        resetFileInput();
    }
}

function handlePaste(event) {
    if (document.activeElement !== messageInput) return;
    const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const imageFile = item.getAsFile();
            if (imageFile) {
                if (selectedFile) handleRemoveFile(); // Clear previous selection first
                const processed = processSelectedFile(imageFile);
                if (processed) {
                    event.preventDefault();
                    console.log("Image paste handled successfully.");
                    break;
                } else {
                     console.log("Pasted image processing failed.");
                }
            }
        }
    }
}

// **************************************************
// START MODIFIED SECTION for handleRemoveFile
// **************************************************
function handleRemoveFile() {
    selectedFile = null;
    selectedFileBase64 = null;
    selectedFileType = null;
    imagePreview.src = '#'; // Clear preview src (removes image or SVG)
    pdfFilenamePreview.textContent = ''; // <<< CLEAR Filename text
    pdfFilenamePreview.style.display = 'none'; // <<< HIDE Filename element
    imagePreviewContainer.classList.add('hidden'); // Hide preview container
    resetFileInput(); // Clear the actual file input element
    attachButton.classList.remove('has-file'); // Update attach button style
    hideError(); // Clear any file-related errors
    console.log("Selected file removed.");
}
// **************************************************
// END MODIFIED SECTION for handleRemoveFile
// **************************************************

function resetFileInput() {
    fileUploadInput.value = null;
}
// --- END File Handling Functions ---


// --- Core Message Sending Logic ---

async function _sendMessageToServer(historyToProcess) {
    showLoading(); // Show loading at the start of the async operation
    try {
        const payload = { history: [...historyToProcess] };
        console.log("Sending payload to /api/chat:", { historyLength: payload.history.length });

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch (e) { console.warn("Could not parse API error JSON."); try { const txt = await response.text(); if(txt) errorMsg += `\nResponse: ${txt.substring(0,200)}...`; } catch(e2){} }
            if (response.status === 413) errorMsg = `Request Failed: Payload too large (${response.statusText}). Max file size is ~${MAX_FILE_SIZE_MB}MB.`;
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml;
        console.log(`AI Response received (using ${data.modelUsed || 'unknown model'})`);

        const aiMessageId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        // Update global conversationHistory from within this function
        conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }], id: aiMessageId });
        displayMessage('ai', aiResponseText, null, searchSuggestionHtml, aiMessageId);

    } catch (err) {
        console.error("Error during send/receive:", err);
        showError(err.message || "Failed to get response.");
        // No history rollback here for now, simplifying error recovery.
        // The user message that triggered this remains in history and UI.
    } finally {
        hideLoading();
        sendButton.disabled = false; // Re-enable send button in all cases
    }
}

async function handleSendMessage() {
    const userMessageText = messageInput.value.trim();
    if (!userMessageText && !selectedFile) return;

    sendButton.disabled = true; // Disable here, _sendMessageToServer will re-enable in its finally.
    // hideError(); // handleRemoveFile called later will hide error.
    // showLoading(); // _sendMessageToServer will handle its own loading indicator.

    const messageParts = [];
    let fileInfoForDisplay = null;

    if (selectedFileBase64 && selectedFile && selectedFileType) {
        messageParts.push({
            inlineData: { mimeType: selectedFile.type, data: selectedFileBase64 }
        });
        if (selectedFileType === 'image') {
            fileInfoForDisplay = { type: 'image', dataUrl: selectedFileBase64, name: selectedFile.name };
        } else if (selectedFileType === 'pdf') {
             fileInfoForDisplay = { type: 'pdf', name: selectedFile.name };
        }
    }
    if (userMessageText) {
        messageParts.push({ text: userMessageText });
    }

    if (messageParts.length === 0) { // Re-check if only file was selected then removed, or text was only spaces
        sendButton.disabled = false; // Re-enable send button
        console.warn("Message sending aborted: No parts prepared.");
        return;
    }

    const userMessageId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    conversationHistory.push({ role: 'user', parts: messageParts, id: userMessageId });
    displayMessage('user', userMessageText || '', fileInfoForDisplay, null, userMessageId);

    messageInput.value = '';
    handleRemoveFile(); // This also hides error via its own logic, which is fine.
    adjustTextareaHeight();

    if (isMobileDevice()) {
        messageInput.blur();
    } else {
        messageInput.focus();
    }

    await _sendMessageToServer(conversationHistory); // Call the refactored function
    // sendButton state will be managed by _sendMessageToServer's finally block.
}
// --- END Core Message Sending Logic ---


// --- Display & Formatting ---
function displayMessage(role, text, fileInfo = null, searchSuggestionHtml = null, messageId) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');
    if (messageId) {
        messageDiv.dataset.messageId = messageId;
    }
    let contentAdded = false;

    if (fileInfo && role === 'user') {
        if (fileInfo.type === 'image' && fileInfo.dataUrl) {
            const imgElement = document.createElement('img');
            imgElement.classList.add('message-image');
            imgElement.src = fileInfo.dataUrl;
            imgElement.alt = `User uploaded image: ${fileInfo.name || 'image'}`;
            imgElement.title = `Click to view image: ${fileInfo.name || 'image'}`;
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

    if (text) {
        const paragraph = document.createElement('p');
        if (role === 'ai' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                marked.setOptions({ breaks: true, gfm: true });
                const rawHtml = marked.parse(text);
                paragraph.innerHTML = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
            } catch (error) {
                console.error("Markdown processing error:", error);
                paragraph.textContent = text; // Fallback
            }
        } else {
            paragraph.textContent = text;
        }
        if (paragraph.innerHTML.trim() || paragraph.textContent.trim()) {
             messageDiv.appendChild(paragraph);
             contentAdded = true;
        }
    }

    // Add Edit button for user messages
    if (role === 'user' && contentAdded) { // Ensure there's content before adding edit button
        const editButton = document.createElement('button');
        editButton.classList.add('edit-btn');
        editButton.textContent = '✏️';
        editButton.title = 'Edit this message';

        editButton.addEventListener('click', (event) => {
            const button = event.currentTarget;
            const messageDiv = button.closest('.user-message');
            if (!messageDiv) return;

            const messageId = messageDiv.dataset.messageId;
            if (!messageId) {
                console.error('Could not find message ID for editing.');
                return;
            }

            // Find the original message object in conversationHistory
            const messageIndex = conversationHistory.findIndex(msg => msg.id === messageId);
            if (messageIndex === -1) {
                console.error('Message to edit not found in history.');
                return;
            }
            const messageObject = conversationHistory[messageIndex];

            const textPart = messageObject.parts.find(part => typeof part.text === 'string');
            const originalText = textPart ? textPart.text : '';

            const existingTextParagraphs = messageDiv.querySelectorAll('p');
            existingTextParagraphs.forEach(p => p.style.display = 'none');
            button.style.display = 'none'; // Hide the "Edit" button

            const textarea = document.createElement('textarea');
            textarea.classList.add('edit-message-textarea');
            textarea.value = originalText;
            textarea.style.width = '100%';
            textarea.style.minHeight = '50px';
            textarea.style.marginTop = '5px';

            // Define cancelButton before saveButton's listener to make it accessible
            const cancelButton = document.createElement('button');
            cancelButton.classList.add('cancel-edit-btn');
            cancelButton.textContent = '❌';
            cancelButton.style.marginTop = '5px';

            cancelButton.addEventListener('click', () => {
                // messageDiv, button (original Edit btn), and existingTextParagraphs
                // are available from the outer scope of editButton's listener.

                const editControlsContainer = messageDiv.querySelector('.edit-controls-container');
                if (editControlsContainer) {
                    editControlsContainer.remove();
                }

                existingTextParagraphs.forEach(p => p.style.display = ''); // Re-show original paragraphs
                button.style.display = ''; // Re-show original Edit button
            });

            const saveButton = document.createElement('button');
            saveButton.classList.add('save-edit-btn');
            saveButton.textContent = '✅';
            saveButton.style.marginRight = '5px';
            saveButton.style.marginTop = '5px';

            saveButton.addEventListener('click', async () => {
                // Disable buttons in edit mode
                saveButton.disabled = true;
                cancelButton.disabled = true; // Now cancelButton is in scope
                textarea.disabled = true;

                const newText = textarea.value.trim();

                // messageId, messageObject, messageIndex, messageDiv, button (original Edit btn)
                // are available from the outer scope (editButton listener)

                let textPart = messageObject.parts.find(part => typeof part.text === 'string');
                if (textPart) {
                    textPart.text = newText;
                } else {
                    messageObject.parts.push({ text: newText });
                }

                if (messageIndex < conversationHistory.length - 1) {
                    conversationHistory.splice(messageIndex + 1);
                }

                let currentMessageDiv = messageDiv.nextElementSibling;
                while (currentMessageDiv) {
                    const nextSibling = currentMessageDiv.nextElementSibling;
                    currentMessageDiv.remove();
                    currentMessageDiv = nextSibling;
                }

                const editControlsContainer = messageDiv.querySelector('.edit-controls-container');
                if (editControlsContainer) {
                    editControlsContainer.remove();
                }

                let textDisplayParagraph = messageDiv.querySelector('p');
                if (!textDisplayParagraph) {
                    textDisplayParagraph = document.createElement('p');
                    const mediaElement = messageDiv.querySelector('.message-image, .pdf-info');
                    const refNode = messageDiv.querySelector('.edit-btn'); // original edit button
                    if (mediaElement) {
                        mediaElement.insertAdjacentElement('afterend', textDisplayParagraph);
                    } else if (refNode) {
                         messageDiv.insertBefore(textDisplayParagraph, refNode);
                    } else { // Should not happen if edit-btn was there
                        messageDiv.appendChild(textDisplayParagraph);
                    }
                }
                textDisplayParagraph.textContent = newText;
                textDisplayParagraph.style.display = '';

                button.style.display = ''; // Re-show original Edit button

                await _sendMessageToServer(conversationHistory);
            });

            // cancelButton is already defined above

            const editControlsContainer = document.createElement('div');
            editControlsContainer.classList.add('edit-controls-container');
            editControlsContainer.appendChild(textarea);

            const actionButtonsDiv = document.createElement('div');
            actionButtonsDiv.classList.add('edit-action-buttons');
            actionButtonsDiv.appendChild(saveButton);
            actionButtonsDiv.appendChild(cancelButton);
            editControlsContainer.appendChild(actionButtonsDiv); // Append the div containing both buttons

            messageDiv.appendChild(editControlsContainer);
            textarea.focus();
        });

        messageDiv.appendChild(editButton);
    }

    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container');
        try {
            suggestionContainer.innerHTML = searchSuggestionHtml;
            if (suggestionContainer.innerHTML.trim()) {
                 messageDiv.appendChild(suggestionContainer);
                 contentAdded = true;
            }
        } catch (error) { console.error("Error setting innerHTML for search suggestions:", error); }
    }

    if (contentAdded) {
        // Prepare regenerate button for AI messages before appending messageDiv
        if (role === 'ai') {
            // First, remove any regenerate buttons from existing AI messages in chatHistory
            const existingRegenerateButtons = chatHistory.querySelectorAll('.ai-message .regenerate-btn');
            existingRegenerateButtons.forEach(btn => {
                btn.remove();
            });

            const regenerateButton = document.createElement('button');
            regenerateButton.classList.add('regenerate-btn');
            regenerateButton.textContent = '↺'; // U+21BB
            regenerateButton.title = 'Regenerate this response';

            regenerateButton.addEventListener('click', async (event) => {
                const button = event.currentTarget;
                button.disabled = true; // Disable button to prevent multiple clicks

                const messageDivToRegenerate = button.closest('.ai-message');
                if (!messageDivToRegenerate) return;

                const messageIdToRegenerate = messageDivToRegenerate.dataset.messageId;
                if (!messageIdToRegenerate) {
                    console.error('Could not find message ID for regeneration.');
                    button.disabled = false;
                    return;
                }

                // Find index of the message to regenerate in conversationHistory
                const messageIndex = conversationHistory.findIndex(msg => msg.id === messageIdToRegenerate);

                if (messageIndex === -1) {
                    console.error('Message to regenerate not found in history.');
                    button.disabled = false; // Re-enable if something went wrong early
                    return;
                }

                // Ensure it's actually an AI message we're about to remove
                if (conversationHistory[messageIndex].role !== 'model') {
                    console.error('Attempted to regenerate a non-AI message. Aborting.');
                    button.disabled = false;
                    return;
                }

                // Remove the AI message from conversationHistory
                conversationHistory.splice(messageIndex, 1);

                // Remove the AI message div from the DOM
                messageDivToRegenerate.remove();

                // Call _sendMessageToServer. It will handle UI updates like loading indicators.
                await _sendMessageToServer(conversationHistory);
            });

            messageDiv.appendChild(regenerateButton); // Add button to the current messageDiv
        }

        chatHistory.appendChild(messageDiv); // Now append the fully prepared messageDiv

        if (role === 'user') {
            scrollChatToBottom();
        } else if (role === 'ai') {
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
function showError(message) { errorDisplay.textContent = message; errorDisplay.classList.remove('hidden'); console.error("Displaying error:", message); errorDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function hideError() { errorDisplay.classList.add('hidden'); errorDisplay.textContent = ''; }
// --- END UI Utility Functions ---


// --- Initial Setup ---
messageInput.focus();
adjustTextareaHeight();
console.log("Kramer Intelligence script initialized.");
// --- END Initial Setup ---