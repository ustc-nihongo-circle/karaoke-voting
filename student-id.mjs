export function normalizeStudentId(value) {
    if (typeof value !== 'string') return null;
    const id = value.trim();
    return /^[A-Za-z]{2}[0-9]{8}$/.test(id) ? id.toUpperCase() : null;
}
