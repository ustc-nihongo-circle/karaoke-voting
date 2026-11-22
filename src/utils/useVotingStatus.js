import { computed, onMounted, onUnmounted, ref } from 'vue';

export function useVotingStatus() {
  const status = ref(null);
  const error = ref(false);
  const now = ref(Date.now());
  let offset = 0;
  let refreshTimer;
  let clockTimer;
  let controller;
  let active = true;

  const seconds = computed(() => status.value?.phase === 'open'
    ? Math.max(0, Math.ceil((Date.parse(status.value.closesAt) - now.value - offset) / 1000)) : 0);
  const phase = computed(() => status.value?.phase === 'open' && seconds.value === 0 ? 'closed' : status.value?.phase);
  const countdown = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`);

  async function refresh() {
    if (!active || controller) return;
    clearTimeout(refreshTimer);
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch('/api/vote/status', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Vote status unavailable');
      const data = await response.json();
      const serverTime = Date.parse(data.serverNow);
      if (!Number.isFinite(serverTime) || !['waiting', 'open', 'closed'].includes(data.phase)
        || (data.phase === 'open' && !Number.isFinite(Date.parse(data.closesAt)))) throw new Error('Invalid vote status');
      now.value = Date.now();
      offset = serverTime - now.value;
      status.value = data;
      error.value = false;
    } catch {
      error.value = true;
    } finally {
      clearTimeout(timeout);
      controller = undefined;
      if (active) refreshTimer = setTimeout(refresh, 8000 + Math.random() * 4000);
    }
  }

  onMounted(() => {
    refresh();
    clockTimer = setInterval(() => { now.value = Date.now(); }, 1000);
  });
  onUnmounted(() => {
    active = false;
    clearTimeout(refreshTimer);
    clearInterval(clockTimer);
    controller?.abort();
  });
  return { phase, countdown, error, refresh };
}
