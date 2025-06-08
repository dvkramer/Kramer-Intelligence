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
// let conversationHistory = []; // Removed for branching
let selectedFile = null;
let selectedFileType = null; // 'image' or 'pdf'
let selectedFileBase64 = null; // Data URL (includes prefix like 'data:image/png;base64,')

// --- Branching State Variables ---
let conversationBranches = []; // Stores all branch objects
let activeBranchId = null;     // ID of the currently active branch
let nextBranchId = 0;          // Simple counter for generating unique branch IDs
// --- End Branching State Variables ---
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

chatHistory.addEventListener('click', function(event) {
    const target = event.target;
    let direction = null;

    if (target.classList.contains('branch-prev')) {
        direction = 'prev';
    } else if (target.classList.contains('branch-next')) {
        direction = 'next';
    }

    if (direction) {
        target.disabled = true; // Disable button to prevent rapid clicks
        const messageId = target.dataset.messageId;
        // Call a new function to handle the switch
        handleBranchSwitchAttempt(messageId, direction);
        // Re-enable button after a short delay or after render (complex)
        // For now, leave it disabled, or re-enable after a timeout for simplicity
        setTimeout(() => target.disabled = false, 500);
    }
});

// --- Functions ---

function handleBranchSwitchAttempt(baseMessageId, direction) {
    // Get current divergence info. BaseMessageId is the ID of the message
    // in the bubble that holds the nav buttons. This message itself is part of activeBranchId.
    const divergenceInfo = getBranchDivergenceInfo(baseMessageId, activeBranchId);

    if (!divergenceInfo.isDivergence || divergenceInfo.branches.length <= 1) {
        console.warn("Branch switch attempted, but no divergence or only one branch.", divergenceInfo);
        return;
    }

    let targetBranchIndex = divergenceInfo.currentIndex;
    if (direction === 'prev') {
        targetBranchIndex = (divergenceInfo.currentIndex - 1 + divergenceInfo.branches.length) % divergenceInfo.branches.length;
    } else if (direction === 'next') {
        targetBranchIndex = (divergenceInfo.currentIndex + 1) % divergenceInfo.branches.length;
    }

    const newActiveBranchId = divergenceInfo.branches[targetBranchIndex];

    if (newActiveBranchId && newActiveBranchId !== activeBranchId) {
        activeBranchId = newActiveBranchId;
        console.log(`Switched active branch to: ${activeBranchId}`);
        renderBranch(activeBranchId); // Re-render with the new active branch
    } else if (newActiveBranchId === activeBranchId) {
        console.log("Already on this branch.");
    } else {
        console.error("Target branch ID for switch is invalid.");
    }
}

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
        // Update active branch's messages
        const activeBranchForAI = conversationBranches.find(branch => branch.id === activeBranchId);
        if (activeBranchForAI) {
            activeBranchForAI.messages.push({ role: 'model', parts: [{ text: aiResponseText }], id: aiMessageId });
        } else {
            console.error("CRITICAL: No active branch found to add AI message to!");
            // Not adding to any history as a fallback here, to highlight the issue.
        }
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
    const activeBranch = conversationBranches.find(branch => branch.id === activeBranchId);
    if (activeBranch) {
        activeBranch.messages.push({ role: 'user', parts: messageParts, id: userMessageId });
    } else {
        console.error("CRITICAL: No active branch found to add message to!");
        // Fallback to a temporary non-branched array to avoid immediate full failure,
        // This indicates a problem with branch initialization or management.
        // This fallback should ideally be removed once branching is fully integrated.
        // if (typeof tempLegacyHistory === 'undefined') {
            // tempLegacyHistory = []; // This would require declaring tempLegacyHistory globally if used.
            console.error("Skipping message add as no active branch and no fallback declared.");
            sendButton.disabled = false; // Re-enable send button
            return; // Or handle error more gracefully
        // }
        // tempLegacyHistory.push({ role: 'user', parts: messageParts, id: userMessageId });
    }
    displayMessage('user', userMessageText || '', fileInfoForDisplay, null, userMessageId);

    messageInput.value = '';
    handleRemoveFile(); // This also hides error via its own logic, which is fine.
    adjustTextareaHeight();

    if (isMobileDevice()) {
        messageInput.blur();
    } else {
        messageInput.focus();
    }

    const currentActiveBranchForAPI = conversationBranches.find(branch => branch.id === activeBranchId);
    if (currentActiveBranchForAPI) {
        await _sendMessageToServer(currentActiveBranchForAPI.messages);
    } else {
        console.error("CRITICAL: No active branch found for sending to server!");
        // await _sendMessageToServer(tempLegacyHistory || []); // Fallback if using tempLegacyHistory
        showError("Error: Could not find active conversation data to send.");
        sendButton.disabled = false; // Re-enable send button
        return;
    }
    // sendButton state will be managed by _sendMessageToServer's finally block.
}
// --- END Core Message Sending Logic ---


// --- Display & Formatting ---
function displayMessage(role, text, fileInfo = null, searchSuggestionHtml = null, messageId) {
    const messageEntryDiv = document.createElement('div');
    messageEntryDiv.classList.add('message-entry');
    if (messageId) {
        messageEntryDiv.dataset.messageEntryId = messageId;
    }
    if (role === 'user') {
        messageEntryDiv.classList.add('user-message-entry');
    } else {
        messageEntryDiv.classList.add('ai-message-entry');
    }

    const messageBubbleDiv = document.createElement('div');
    messageBubbleDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');
    if (messageId) {
        messageBubbleDiv.dataset.messageId = messageId;
    }
    let contentAddedToBubble = false;

    // TODO: Branching UI Logic (Step 2 - Placeholder)
    // This section will be expanded in the next plan step to add actual UI and logic.
    // For now, it's a placeholder to indicate where it will go.
    // const divergencePointInfo = getBranchDivergenceInfo(messageId, activeBranchId); // messageId here is of the current message being displayed
    // For the purpose of branching, the "divergence point" is conceptually *after* a message.
    // Or, an edited message *becomes* a divergence point. This depends on Step 4's exact model.
    // Let's assume for now that if a message *was* edited, it gets branch controls.
    // This is still a placeholder until Step 4 solidifies how parentMessageId is set.
    // For testing, let's assume messageId 'branch_point_test_msg_id' has branches.
    const divergenceInfo = getBranchDivergenceInfo(messageId, activeBranchId); // Call with the ID of the current message

    if (divergenceInfo.isDivergence && divergenceInfo.branches.length > 1) {
        const branchNavDiv = document.createElement('div');
        branchNavDiv.classList.add('branch-nav');
        // branchNavDiv.style.textAlign = (role === 'user') ? 'right' : 'left'; // CSS will handle better
        branchNavDiv.innerHTML = `
            <button class="branch-prev" data-message-id="${messageId}" title="Previous Branch" ${divergenceInfo.currentIndex === 0 ? 'disabled' : ''}>&lt;</button>
            <span class="branch-indicator">Branch ${divergenceInfo.currentIndex + 1}/${divergenceInfo.totalBranches}</span>
            <button class="branch-next" data-message-id="${messageId}" title="Next Branch" ${divergenceInfo.currentIndex === divergenceInfo.totalBranches - 1 ? 'disabled' : ''}>&gt;</button>
        `;
        // messageBubbleDiv.appendChild(branchNavDiv); // Old position
        actionButtonBar.appendChild(branchNavDiv); // New position: inside action bar
    }

    if (fileInfo && role === 'user') {
        if (fileInfo.type === 'image' && fileInfo.dataUrl) {
            const imgElement = document.createElement('img');
            imgElement.classList.add('message-image');
            imgElement.src = fileInfo.dataUrl;
            imgElement.alt = `User uploaded image: ${fileInfo.name || 'image'}`;
            imgElement.title = `Click to view image: ${fileInfo.name || 'image'}`;
            imgElement.addEventListener('click', () => window.open(fileInfo.dataUrl, '_blank'));
            messageBubbleDiv.appendChild(imgElement);
            contentAddedToBubble = true;
        } else if (fileInfo.type === 'pdf' && fileInfo.name) {
            const pdfInfoDiv = document.createElement('div');
            pdfInfoDiv.classList.add('pdf-info');
            pdfInfoDiv.textContent = `📎 Sent PDF: ${fileInfo.name}`;
            messageBubbleDiv.appendChild(pdfInfoDiv);
            contentAddedToBubble = true;
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
             messageBubbleDiv.appendChild(paragraph);
             contentAddedToBubble = true;
        }
    }

    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container');
        try {
            suggestionContainer.innerHTML = searchSuggestionHtml;
            if (suggestionContainer.innerHTML.trim()) {
                 messageBubbleDiv.appendChild(suggestionContainer);
                 contentAddedToBubble = true;
            }
        } catch (error) { console.error("Error setting innerHTML for search suggestions:", error); }
    }

    const actionButtonBar = document.createElement('div');
    actionButtonBar.classList.add('action-button-bar'); // Base class
    actionButtonBar.classList.add('message-action-buttons'); // New generic class for the bar itself
    if (role === 'user') {
        actionButtonBar.classList.add('user-actions-align'); // For aligning content (buttons) inside
    } else {
        actionButtonBar.classList.add('ai-actions-align');   // For aligning content (buttons) inside
    }
    if (messageId) {
        actionButtonBar.dataset.controlsMessageId = messageId;
    }

    // Add Edit button for user messages
    if (role === 'user' && contentAddedToBubble) {
        const editButton = document.createElement('button');
        editButton.classList.add('edit-btn');
        editButton.textContent = '✏️';
        editButton.title = 'Edit this message';

        editButton.addEventListener('click', (event) => {
            const originalEditButton = event.currentTarget;
            const currentActionBar = originalEditButton.closest('.action-button-bar');
            if (!currentActionBar) return;

            const messageIdForEdit = currentActionBar.dataset.controlsMessageId;
            if (!messageIdForEdit) {
                console.error('Could not find message ID for editing from action bar.');
                return;
            }

            const messageEntry = currentActionBar.closest('.message-entry');
            if (!messageEntry) return;
            const messageBubble = messageEntry.querySelector('.message.user-message');
            if (!messageBubble) return;

            // Find the active branch
            const activeBranch = conversationBranches.find(b => b.id === activeBranchId);
            if (!activeBranch) {
                console.error("No active branch found for editing.");
                return;
            }

            const messageIndexInActiveBranch = activeBranch.messages.findIndex(msg => msg.id === messageIdForEdit);
            if (messageIndexInActiveBranch === -1) {
                console.error('Message to edit not found in active branch.');
                return;
            }

            const messageObjectToEdit = activeBranch.messages[messageIndexInActiveBranch];
            const textPart = messageObjectToEdit.parts.find(part => typeof part.text === 'string');
            const originalText = textPart ? textPart.text : '';
            // const originalBubbleHTML = messageBubble.innerHTML; // Storing HTML is fragile; rebuild from data.

            // --- UI for editing (textarea, save/cancel buttons) ---
            originalEditButton.style.display = 'none';
            const existingBranchNav = currentActionBar.querySelector('.branch-nav');
            if (existingBranchNav) existingBranchNav.style.display = 'none';


            messageBubble.innerHTML = ''; // Clear the bubble for textarea

            const textarea = document.createElement('textarea');
            textarea.classList.add('edit-message-textarea');
            textarea.value = originalText;
            messageBubble.appendChild(textarea); // Place textarea directly in bubble

            const saveButton = document.createElement('button');
            saveButton.classList.add('save-edit-btn');
            saveButton.textContent = '✅';
            saveButton.title = 'Save changes';

            const cancelButton = document.createElement('button');
            cancelButton.classList.add('cancel-edit-btn');
            cancelButton.textContent = '❌';
            cancelButton.title = 'Cancel edit';

            cancelButton.addEventListener('click', () => {
                // Just re-render the current active branch to restore view
                renderBranch(activeBranchId);
            });

            saveButton.addEventListener('click', async () => {
                saveButton.disabled = true;
                cancelButton.disabled = true;
                textarea.disabled = true;
                const newText = textarea.value.trim();

                // ** Branch Creation Logic **
                // 1. Preserve the "old path" if any messages existed after the edited one.
                if (messageIndexInActiveBranch < activeBranch.messages.length - 1) {
                    const oldPathMessages = activeBranch.messages.slice(messageIndexInActiveBranch + 1);
                    // The parent of this "old path" branch is the message being edited.
                    createNewBranch(oldPathMessages, messageObjectToEdit.id, activeBranchId);
                    console.log(`Created new branch for old path from message ${messageObjectToEdit.id}`);
                }

                // 2. Update the message in the active branch.
                let textPartToUpdate = messageObjectToEdit.parts.find(part => typeof part.text === 'string');
                if (textPartToUpdate) {
                    textPartToUpdate.text = newText;
                } else { // Should not happen if originalText was found
                    messageObjectToEdit.parts.push({ text: newText });
                }
                // Ensure the message ID remains the same for the edited message.

                // 3. Truncate the active branch after the edited message.
                activeBranch.messages.splice(messageIndexInActiveBranch + 1);

                // 4. Re-render the (now modified) active branch.
                // This will also update UI with branch indicators via displayMessage.
                renderBranch(activeBranchId);

                // 5. Send the history of the current (truncated and edited) active branch to AI.
                //    The existing _sendMessageToServer will use activeBranch.messages.
                //    No need to find currentActiveBranchAPI again if activeBranch is already in scope.
                if (activeBranch) {
                    await _sendMessageToServer(activeBranch.messages);
                } else {
                    // This case should ideally not be reached if activeBranch was confirmed above.
                    console.error("CRITICAL: Lost active branch context before sending to server after edit.");
                    showError("Error: Active conversation data lost after edit.");
                }
            }); // End of saveButton listener

            currentActionBar.innerHTML = ''; // Clear Edit button (and any branch nav)
            currentActionBar.appendChild(saveButton);
            currentActionBar.appendChild(cancelButton);
            textarea.focus();
            // --- End UI for editing ---
        });
        actionButtonBar.appendChild(editButton);
    }

    // Add Regenerate button for AI messages
    if (role === 'ai' && contentAddedToBubble) {
        // Remove regenerate buttons from previous AI messages' action bars
        const allActionBars = chatHistory.querySelectorAll('.action-button-bar');
        allActionBars.forEach(bar => {
            const oldRegenBtn = bar.querySelector('.regenerate-btn');
            if (oldRegenBtn) oldRegenBtn.remove();
        });

        const regenerateButton = document.createElement('button');
        regenerateButton.classList.add('regenerate-btn');
        regenerateButton.textContent = '↺';
        regenerateButton.title = 'Regenerate this response';

        regenerateButton.addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.disabled = true;

            const currentActionBar = button.closest('.action-button-bar');
            if (!currentActionBar) { button.disabled = false; return; }
            const messageIdToRegenerate = currentActionBar.dataset.controlsMessageId;

            if (!messageIdToRegenerate) {
                console.error('Could not find message ID for regeneration from action bar.');
                button.disabled = false;
                return;
            }

            const activeBranch = conversationBranches.find(b => b.id === activeBranchId);
            if (!activeBranch) {
                console.error("No active branch found for regenerating.");
                button.disabled = false;
                return;
            }

            const messageIndex = activeBranch.messages.findIndex(msg => msg.id === messageIdToRegenerate);

            if (messageIndex === -1 || activeBranch.messages[messageIndex].role !== 'model') {
                console.error('Message to regenerate not found in active branch or not an AI message.');
                button.disabled = false;
                return;
            }

            // Option 1: Simple regenerate - create a new branch for this alternative response.
            const parentMessageForNewBranch = messageIndex > 0 ? activeBranch.messages[messageIndex - 1] : null;

            // Create a new branch containing messages up to (but not including) the one being regenerated.
            const newBranchForRegenMessages = activeBranch.messages.slice(0, messageIndex);
            const newBranchIdForRegen = createNewBranch(
                newBranchForRegenMessages,
                parentMessageForNewBranch ? parentMessageForNewBranch.id : null,
                activeBranch.id // The originating branch is the current active one
            );

            activeBranchId = newBranchIdForRegen; // Switch to this new branch path.

            // Re-render the new active branch (will show history up to the point of regeneration)
            renderBranch(activeBranchId);

            // Send history of this new branch (up to the point before AI response) to server.
            const currentRegenBranch = conversationBranches.find(b => b.id === activeBranchId);
            if (currentRegenBranch) {
               await _sendMessageToServer(currentRegenBranch.messages);
            } else {
                console.error("Could not find the newly created branch for regeneration.");
                showError("Error during regeneration process.");
                button.disabled = false; // Manually re-enable if we don't call _sendMessageToServer
            }
            // button.disabled will be re-enabled by _sendMessageToServer's finally block if called.
        });
        actionButtonBar.appendChild(regenerateButton);
    }

    if (contentAddedToBubble) {
        messageEntryDiv.appendChild(messageBubbleDiv);
        messageEntryDiv.appendChild(actionButtonBar);
        chatHistory.appendChild(messageEntryDiv);

        if (role === 'user') {
            scrollChatToBottom();
        } else if (role === 'ai') {
             setTimeout(() => scrollToMessageTop(messageBubbleDiv), 50);
        }
    } else {
         console.warn("Skipped appending an empty message.");
    }
}
// --- END Display & Formatting ---

// --- UI Utility Functions ---
function showLoading() { loadingIndicator.classList.remove('hidden'); }
function hideLoading() { loadingIndicator.classList.add('hidden'); }
function showError(message) { errorDisplay.textContent = message; errorDisplay.classList.remove('hidden'); console.error("Displaying error:", message); errorDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function hideError() { errorDisplay.classList.add('hidden'); errorDisplay.textContent = ''; }
// --- END UI Utility Functions ---


function clearChatHistoryDisplay() {
    chatHistory.innerHTML = '';
}

function getBranchDivergenceInfo(messageId, currentBranchId) {
    const currentBranch = conversationBranches.find(b => b.id === currentBranchId);
    if (!currentBranch) return { isDivergence: false, branches: [], currentIndex: 0, totalBranches: 1 };

    // Find all direct child branches that spawned from this messageId in this currentBranchId
    const childBranches = conversationBranches.filter(branch =>
        branch.parentMessageId === messageId &&
        branch.originatingBranchId === currentBranchId
    );

    if (childBranches.length > 0) {
        // The list of choices at this divergence: current branch itself + all child branches.
        const allChoices = [currentBranchId, ...childBranches.map(b => b.id)];
        const idx = allChoices.indexOf(currentBranchId); // Should always be 0 if currentBranchId is the parent path

        return {
            isDivergence: true,
            branches: allChoices,
            currentIndex: idx !== -1 ? idx : 0, // currentBranchId is one of the choices
            totalBranches: allChoices.length
        };
    }
    return { isDivergence: false, branches: [currentBranchId], currentIndex: 0, totalBranches: 1 };
}

function renderBranch(branchIdToRender) {
    clearChatHistoryDisplay();
    const branch = conversationBranches.find(b => b.id === branchIdToRender);
    if (branch) {
        branch.messages.forEach(msg => {
            // Reconstruct fileInfo for display if needed.
            // This part might need more sophisticated handling if fileInfo was complex
            // and not stored directly in message parts suitable for re-display.
            // For now, assume text, searchSuggestionHtml, and id are primary.
            // User messages with files might need special attention later.

            let fileInfoForDisplay = null;
            if (msg.role === 'user' && msg.parts) {
                const filePart = msg.parts.find(part => part.inlineData);
                if (filePart) {
                    // This is a simplified reconstruction.
                    // The original `displayMessage` took a `fileInfo` object that was
                    // prepared before pushing to `conversationHistory`.
                    // We need to ensure this path still works or is adapted.
                    // For now, this might mean user file previews in re-rendered branches are basic.
                    fileInfoForDisplay = {
                        type: filePart.inlineData.mimeType.startsWith('image/') ? 'image' : 'pdf',
                        name: 'Attached File' // Placeholder, original name might not be easily available
                    };
                    if (fileInfoForDisplay.type === 'image') {
                        // This is tricky: we stored base64 for sending, not necessarily for re-display directly in this structure.
                        // `displayMessage` for user images expects `dataUrl`.
                        // This might be a limitation of not storing the dataUrl directly in the message part.
                        // For now, image re-rendering in branches might be broken.
                        console.warn("Image re-rendering in branches needs review for dataUrl availability.");
                    }
                }
            }

            // Extract main text content
            const textPart = msg.parts.find(part => part.text);
            const messageText = textPart ? textPart.text : '';

            // Extract search suggestion (assuming it's stored with AI message)
            // This part needs to be confirmed based on how searchSuggestionHtml is stored.
            // Let's assume it's not directly in 'parts' but was a separate param to displayMessage.
            // For now, pass null for searchSuggestionHtml when re-rendering.
            // This is a simplification for this step.

            displayMessage(msg.role, messageText, fileInfoForDisplay, null /* searchSuggestionHtml */, msg.id);
        });
    } else {
        console.error(`Branch with ID ${branchIdToRender} not found for rendering.`);
    }
}

// --- Initial Setup ---
messageInput.focus();
adjustTextareaHeight();

function createNewBranch(messages = [], parentMsgId = null, originatingBranchId = null) {
    const newBranch = {
        id: `branch_${nextBranchId++}`,
        messages: [...messages], // Start with a copy of provided messages
        parentMessageId: parentMsgId, // ID of the message in parent branch where this branched off
        originatingBranchId: originatingBranchId // ID of the branch this new one diverged from
    };
    conversationBranches.push(newBranch);
    return newBranch.id;
}

// Initialize the root branch
if (conversationBranches.length === 0) {
    activeBranchId = createNewBranch();
    console.log(`Root branch initialized: ${activeBranchId}`);
    renderBranch(activeBranchId); // Display the initial root branch
}

console.log("Kramer Intelligence script initialized.");
// --- END Initial Setup ---