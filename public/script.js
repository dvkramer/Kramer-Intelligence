const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatHistory = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading');
const errorDisplay = document.getElementById('error');

// --- Configuration ---
// Using 1M character limit as requested (~ corresponds to a large token count)
const MAX_HISTORY_CHARS = 1000000;
// --- End Configuration ---

// Stores the conversation history in the format expected by the Gemini API
// We initialize with the first AI message shown in index.html
let conversationHistory = [
    {
        role: 'model',
        parts: [{ text: 'Hello! How can I help you today?' }]
    }
];

// --- Event Listeners ---

chatForm.addEventListener('submit', handleSendMessage);

// --- Functions ---

/**
 * Handles the form submission event.
 * @param {Event} event The form submission event.
 */
async function handleSendMessage(event) {
    event.preventDefault(); // Prevent default page reload

    const userMessageText = messageInput.value.trim();
    if (!userMessageText) return; // Do nothing if input is empty

    // Disable input and button during processing
    messageInput.disabled = true;
    sendButton.disabled = true;
    hideError();
    showLoading();

    // Display user message immediately
    displayMessage('user', userMessageText);
    scrollChatToBottom();

    // Add user message to history object
    conversationHistory.push({
        role: 'user',
        parts: [{ text: userMessageText }]
    });

    // Clear the input field
    messageInput.value = '';

    try {
        // Truncate history if it exceeds the character limit
        truncateHistory();

        // Send history to backend API
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ history: conversationHistory }),
        });

        hideLoading();

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API Error: ${response.statusText} (${response.status})`);
        }

        const data = await response.json();
        const aiResponseText = data.text;

        // Add AI response to history and display it
        conversationHistory.push({
            role: 'model',
            parts: [{ text: aiResponseText }]
        });
        displayMessage('ai', aiResponseText);
        scrollChatToBottom();

    } catch (err) {
        console.error("Error fetching AI response:", err);
        showError(err.message || "Failed to get response from AI. Please try again.");
        // Optional: Remove the user's last message from history if the API call failed
        // conversationHistory.pop();
        hideLoading(); // Ensure loading is hidden on error
    } finally {
        // Re-enable input and button
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.focus(); // Put cursor back in input field
    }
}

/**
 * Displays a message in the chat history UI.
 * @param {'user' | 'ai'} role The role of the message sender ('user' or 'ai').
 * @param {string} text The message text content.
 */
function displayMessage(role, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    const paragraph = document.createElement('p');
    paragraph.textContent = text; // Using textContent is safer against XSS
    messageDiv.appendChild(paragraph);

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

    // Remove oldest messages (keeping the first AI greeting might be desirable,
    // so we check length > 2 instead of > 1)
    while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length > 2) {
        // Remove the second message (the first user message after the initial AI greeting)
        // and the third message (its corresponding AI response) to keep pairs.
        // If we only remove one, the roles might get misaligned. A simpler
        // approach is just removing the oldest (index 1, the first *real* user msg).
        // Let's remove the oldest user/model pair after the initial greeting.
        const removedUserMsg = conversationHistory.splice(1, 1)[0]; // Remove oldest user msg (index 1)
        const removedModelMsg = conversationHistory.splice(1, 1)[0]; // Remove oldest model msg (now at index 1)

        if (removedUserMsg?.parts?.[0]?.text) {
             totalChars -= removedUserMsg.parts[0].text.length;
        }
         if (removedModelMsg?.parts?.[0]?.text) {
             totalChars -= removedModelMsg.parts[0].text.length;
        }
        console.log("Truncated history. New char count:", totalChars);
    }
     // Fallback if somehow only one message left after initial
     if (totalChars > MAX_HISTORY_CHARS && conversationHistory.length === 2) {
        const removedMsg = conversationHistory.splice(1, 1)[0];
         if (removedMsg?.parts?.[0]?.text) {
             totalChars -= removedMsg.parts[0].text.length;
        }
         console.log("Truncated history (single msg). New char count:", totalChars);
     }
}


/** Scrolls the chat history container to the bottom. */
function scrollChatToBottom() {
    // Use setTimeout to allow the DOM to update before scrolling
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
scrollChatToBottom(); // Scroll down initially if content exists
messageInput.focus(); // Focus the input field on load