
export async function loadFirebaseConfig() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Failed to fetch config');
        return await response.json();
    } catch (error) {
        console.error("Config Error:", error);
        throw error;
    }
}
