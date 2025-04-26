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
let conversationHistory = []; // MODIFIED HERE

// --- Event Listeners ---
chatForm.addEventListener('submit', handleSendMessage);

// --- Functions ---

// ... (Rest of the handleSendMessage function remains the same) ...
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
            // Try to parse error JSON, otherwise use status text
            let errorMsg = `API Error: ${response.statusText} (${response.status})`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                 // Ignore if response isn't valid JSON
            }
            throw new Error(errorMsg);
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


// ... (displayMessage function remains the same) ...
function displayMessage(role, text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    const paragraph = document.createElement('p');
    paragraph.textContent = text; // Using textContent is safer against XSS
    messageDiv.appendChild(paragraph);

    chatHistory.appendChild(messageDiv);
}

// ... (truncateHistory function remains the same - NOTE: logic adjusted slightly for empty start) ...
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

    // Remove oldest messages (user/model pairs)
    while (totalChars > MAX_HISTORY_CHARS && conversationHistory.length >= 2) {
         // Remove the first two messages (oldest user/model pair)
        const removedUserMsg = conversationHistory.shift(); // Remove oldest (user)
        const removedModelMsg = conversationHistory.shift(); // Remove next oldest (model)

         if (removedUserMsg?.parts?.[0]?.text) {
             totalChars -= removedUserMsg.parts[0].text.length;
        }
         if (removedModelMsg?.parts?.[0]?.text) {
             totalChars -= removedModelMsg.parts[0].text.length;
        }
        console.log("Truncated history. New char count:", totalChars);
    }
     // Safety check if only one message remains and it's somehow too long (unlikely)
     if (totalChars > MAX_HISTORY_CHARS && conversationHistory.length === 1) {
         const removedMsg = conversationHistory.shift();
          if (removedMsg?.parts?.[0]?.text) {
             totalChars -= removedMsg.parts[0].text.length;
         }
         console.log("Truncated history (single msg). New char count:", totalChars);
     }
}

// ... (scrollChatToBottom, showLoading, hideLoading, showError, hideError remain the same) ...
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
// scrollChatToBottom(); // No need to scroll initially if empty
messageInput.focus(); // Focus the input field on load