const maxRequestBytes = 8192;

export class BodyTooLarge extends Error {}

export async function readJson(request) {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let text = '';
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxRequestBytes) {
                await reader.cancel();
                throw new BodyTooLarge();
            }
            text += decoder.decode(value, { stream: true });
        }
    } finally {
        reader.releaseLock();
    }
    try {
        return JSON.parse(text + decoder.decode());
    } catch {
        return null;
    }
}
