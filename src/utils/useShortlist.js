import { onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { singers } from '../../roster-2026.mjs';

import event from '../../event.json';

const prefix = event.key + ':shortlist:';
const closes = event.shortlistExpiresAt ? Date.parse(event.shortlistExpiresAt) : Infinity;
const eligible = new Set(singers.map(singer => singer.id));
const keys = new Map([...eligible].map(id => [prefix + id, id]));
const marked = shallowRef(new Set());
const temporary = ref(false);
const expired = ref(false);

function synchronize() {
  expired.value = Date.now() >= closes;
  if (expired.value) marked.value = new Set();
  if (temporary.value && !expired.value) return;
  try {
    const storage = window.localStorage;
    const ids = new Set();
    // Iterate backwards so deleting an obsolete mark does not skip its neighbour.
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      if (expired.value || !keys.has(key) || storage.getItem(key) !== '1') storage.removeItem(key);
      else ids.add(keys.get(key));
    }
    marked.value = ids;
  } catch {
    temporary.value = true;
  }
}

// A visit to the home page after the event should clean up this event's marks too.
if (typeof window !== 'undefined' && Date.now() >= closes) synchronize();

function toggleMark(id) {
  if (!eligible.has(id)) return;
  synchronize();
  if (expired.value) return;
  const next = new Set(marked.value);
  const add = !next.has(id);
  if (add) next.add(id);
  else next.delete(id);
  if (!temporary.value) {
    try {
      // Independent keys let two tabs mark different entrants without overwriting each other.
      if (add) window.localStorage.setItem(prefix + id, '1');
      else window.localStorage.removeItem(prefix + id);
    } catch {
      temporary.value = true;
    }
  }
  marked.value = next;
}

export function useShortlist() {
  let timer;
  function onStorage(event) {
    if (!event.key || event.key.startsWith(prefix)) synchronize();
  }
  function onVisible() {
    if (document.visibilityState === 'visible') synchronize();
  }
  onMounted(() => {
    synchronize();
    const delay = closes - Date.now();
    if (delay > 0 && delay < 2147483647) timer = setTimeout(synchronize, delay);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', synchronize);
    document.addEventListener('visibilitychange', onVisible);
  });
  onUnmounted(() => {
    clearTimeout(timer);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', synchronize);
    document.removeEventListener('visibilitychange', onVisible);
  });
  return { eligible, marked, expired, temporary, toggleMark };
}

