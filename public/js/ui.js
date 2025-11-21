
// UI Helper Functions
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify/dist/purify.es.min.js";

export function renderMessage(message, container) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${message.role === 'user' ? 'user' : 'ai'}`;

    let contentHtml = '';

    // Handle Parts
    message.parts.forEach(part => {
        if (part.text) {
            // Markdown & Sanitize
            const parsed = marked.parse(part.text);
            contentHtml += DOMPurify.sanitize(parsed);
        }

        // Handle Image Display
        if (part.fileInfoForDisplay) { // Legacy support or new format
            const { type, dataUrl, name } = part.fileInfoForDisplay;
            if (type === 'image') {
                contentHtml += `<div class="media-attachment"><img src="${dataUrl}" alt="${name}" /></div>`;
            } else if (type === 'pdf') {
                contentHtml += `<div class="media-attachment pdf-attachment">📎 PDF: ${name}</div>`;
            }
        }
        // Handle Inline Data (if stored locally before send)
        if (part.inlineData) {
             contentHtml += `<div class="media-attachment"><img src="${part.inlineData.data}" alt="Uploaded Image" /></div>`;
        }
    });

    // Search Suggestions
    if (message.searchSuggestionHtml) {
        contentHtml += `<div class="search-suggestions">${message.searchSuggestionHtml}</div>`;
    }

    msgDiv.innerHTML = contentHtml;
    container.appendChild(msgDiv);

    // LaTeX Rendering (Global function assumed loaded via script tag for now, or we could import katex)
    if (window.renderMathInElement) {
        renderMathInElement(msgDiv, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ]
        });
    }
}

export function clearChat(container) {
    container.innerHTML = '';
}

export function showLoading(container) {
    const loader = document.createElement('div');
    loader.className = 'message ai loading';
    loader.innerText = 'Thinking...';
    loader.id = 'loading-indicator';
    container.appendChild(loader);
}

export function hideLoading() {
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.remove();
}

export function renderChatList(chats, container, onSelect, onDelete) {
    container.innerHTML = '';
    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        const title = document.createElement('span');
        title.innerText = chat.title || 'Untitled Chat';
        title.onclick = () => onSelect(chat.id);

        const delBtn = document.createElement('button');
        delBtn.innerText = '🗑';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            onDelete(chat.id);
        };

        item.appendChild(title);
        item.appendChild(delBtn);
        container.appendChild(item);
    });
}
