
export async function sendMessageToBackend(history, timezone) {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, timezone }),
    });

    if (!response.ok) {
        let errorMsg = response.statusText;
        try {
            const data = await response.json();
            errorMsg = data.error || errorMsg;
        } catch (e) {}
        throw new Error(errorMsg);
    }

    return await response.json();
}
