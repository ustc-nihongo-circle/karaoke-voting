const covers = import.meta.glob('/src/covers/*.webp', { query: '?url&no-inline', import: 'default', eager: true });

export const coverUrl = id => covers['/src/covers/' + id + '.webp'];
