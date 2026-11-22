import event from '../../event.json';
import { AdminAPI } from './AdminApi';
import { cookies } from './cookies';
import { StudentApi } from './StudentApi';

export const api = new StudentApi(null);
export const adminApi = new AdminAPI();
const storageKey = event.key + ':student';
const lifetime = 30 * 24 * 60 * 60 * 1000;

export function rememberStudentId() {
    const id = api.getStudentId();
    if (!id) return;
    try {
        localStorage.setItem(storageKey, JSON.stringify({ id, expires: Date.now() + lifetime }));
    } catch {
        // The current tab can continue when browser storage is unavailable.
    }
}

try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (stored && Number.isFinite(stored.expires) && stored.expires > Date.now()) api.setStudentId(stored.id);
    if (!api.getStudentId()) localStorage.removeItem(storageKey);
} catch {
    // A malformed record or blocked storage should not prevent entry.
}

try {
    const legacy = cookies.get('studentId');
    if (legacy && !api.getStudentId()) {
        api.setStudentId(legacy);
        rememberStudentId();
    }
    cookies.remove('studentId', '/');
    cookies.remove('adminPasscode', '/');
} catch {
    // Cookies are optional for audience entry.
}
