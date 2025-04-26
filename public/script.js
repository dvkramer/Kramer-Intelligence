const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatHistory = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading');
const errorDisplay = document.getElementById('error');

// --- Configuration ---
const MAX_HISTORY_CHARS = 1000000;
// --- End Configuration ---

// Start with an empty history
let conversationHistory = [];

// --- Event Listeners ---
chatForm.addEventListener('submit', handleSendMessage);

// --- Functions ---

async function handleSendMessage(event) {
    event.preventDefault(); // Prevent default page reload

    const userMessageText = messageInput.value.trim();
    if (!userMessageText) return; // Do nothing if input is empty

    // Disable only the Send button
    sendButton.disabled = true;

    hideError();
    showLoading(); // Show loading for this specific request

    // Display user message immediately (using plain text)
    displayMessage('user', userMessageText);
    scrollChatToBottom();

    // Add user message to history object
    conversationHistory.push({
        role: 'user',
        parts: [{ text: userMessageText }]
    });

    // Clear the input field *after* adding to history and displaying
    messageInput.value = '';
    messageInput.focus(); // Keep focus on input after sending

    try {
        // Truncate history if it exceeds the character limit
        truncateHistory();

        // Capture the history state *for this specific request*
        const historyForThisRequest = [...conversationHistory];

        // Send history to backend API
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ history: historyForThisRequest }),
        });

        hideLoading();

        if (!response.ok) {
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) { /* Ignore */ }
            throw new Error(errorMsg);
        }

        // --- MODIFIED: Expect new response format ---
        const data = await response.json();
        const aiResponseText = data.text;
        const searchSuggestionHtml = data.searchSuggestionHtml; // Get suggestion HTML (can be null)

        // Add AI response text part to history
        conversationHistory.push({
            role: 'model',
            parts: [{ text: aiResponseText }] // History only stores the core text
        });

        // Display AI message, passing the suggestion HTML along
        displayMessage('ai', aiResponseText, searchSuggestionHtml);
        scrollChatToBottom();
        // --- END MODIFIED ---

    } catch (err) {
        console.error("Error fetching AI response:", err);
        showError(err.message || "Failed to get response from AI. Please try again.");
        hideLoading();
    } finally {
        // Re-enable only the Send button
        sendButton.disabled = false;
    }
}


/**
 * Displays a message in the chat history UI.
 * Parses Markdown for AI messages using marked and DOMPurify.
 * Renders Google Search Suggestion if provided.
 * @param {'user' | 'ai'} role The role of the message sender ('user' or 'ai').
 * @param {string} text The message text content.
 * @param {string | null} [searchSuggestionHtml=null] Optional HTML string for the Google Search Suggestion chip.
 */
function displayMessage(role, text, searchSuggestionHtml = null) { // MODIFIED: Added parameter
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

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
        // User message or if libraries failed
        paragraph.textContent = text;
    }

    messageDiv.appendChild(paragraph);

    // --- ADDED: Render Search Suggestion Chip ---
    if (role === 'ai' && searchSuggestionHtml) {
        const suggestionContainer = document.createElement('div');
        suggestionContainer.classList.add('search-suggestion-container');
        // Directly insert the HTML provided by Google API (assumed safe per their docs)
        suggestionContainer.innerHTML = searchSuggestionHtml;
        messageDiv.appendChild(suggestionContainer); // Append below the message paragraph
    }
    // --- END ADDED ---

    chatHistory.appendChild(messageDiv);
}


/**
 * Checks the total character count of the history and removes oldest messages if over limit.
 */
function truncateHistory() {
    let totalChars = 0;
    for (const message of conversationHistory) {
        if (message.parts && message.parts[0] && message.parts[0].text) {
            totalChars += message.parts[0].text.length;
        }
    }

    while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length >= 2) {
        const removedUserMsg = conversationHistory.shift();
        const removedModelMsg = conversationHistory.shift();
         if (removedUserMsg?.parts?.[0]?.text) { totalChars -= removedUserMsg.parts[0].text.length; }
         if (removedModelMsg?.parts?.[0]?.text) { totalChars -= removedModelMsg.parts[0].text.length; }
        console.log("Truncated history. New char count:", totalChars);
    }
     if (totalChars > MAX_HISTORY_CHARS && conversationHistory.length === 1) {
         const removedMsg = conversationHistory.shift();
          if (removedMsg?.parts?.[0]?.text) { totalChars -= removedMsg.parts[0].text.length; }
         console.log("Truncated history (single msg). New char count:", totalChars);
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
}

/** Hides the error message. */
function hideError() {
    errorDisplay.classList.add('hidden');
    errorDisplay.textContent = '';
}


// --- Initial Setup ---
messageInput.focus(); // Focus the input field on load