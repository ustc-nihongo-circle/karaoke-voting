<script setup>
import event from '../../event.json';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '@/utils/useGlobalStorage';
import { coverUrl } from '@/utils/coverUrl';
import { singers as programme } from '../../roster-2026.mjs';

const router = useRouter();
const songsByEntrant = new Map(programme.map(singer => [singer.id, singer.songs]));
const data = ref(null);
const fetchedAt = ref('');
const reading = ref(false);
const action = ref('');
const error = ref('');
const stale = ref(false);
const selectedSort = ref('sum');
const selectedDraw = ref([]);
const copyStatus = ref('');
const manualCopy = ref(false);
const announcementField = ref(null);
const busy = computed(() => reading.value || !!action.value);
const permissions = computed(() => data.value?.permissions ?? {});
const status = computed(() => data.value?.status ?? {});
const awards = computed(() => data.value?.awards);
const phase = computed(() => status.value.enabled ? 'open' : status.value.round ? 'closed' : 'waiting');
const phaseLabel = { waiting: '未开票', open: '投票中', closed: '已截止' };
const time = value => new Date(value).toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
const awardLabels = {
  first: '综合一等奖', second: '综合二等奖', third: '综合三等奖',
  japanese: '单项日语水平奖', singing: '单项歌唱水平奖', popularity: '单项人气优胜奖',
};
const columns = computed(() => [
  ...(data.value?.vote_types ?? []).map(type => ({ key: type.name, label: type.display_name })),
  { key: 'sum', label: '总票数' },
]);
const entrants = computed(() => (data.value?.singers ?? []).map(singer => ({
  ...singer, songs: songsByEntrant.get(singer.id) ?? [],
  sum: Object.values(singer.total_votes).reduce((sum, count) => sum + count, 0),
})));
const total = computed(() => entrants.value.reduce((sum, singer) => sum + singer.sum, 0));
const entrantNames = computed(() => new Map(entrants.value.map(s => [s.id, s.name])));
const entrantName = id => entrantNames.value.get(id) ?? String(id);
const score = (singer, key) => key === 'sum' ? singer.sum : singer.total_votes[key] ?? 0;
const rows = computed(() => {
  const value = singer => score(singer, selectedSort.value);
  const sorted = [...entrants.value].sort((a, b) => value(b) - value(a) || b.sum - a.sum);
  let rank = 0;
  return sorted.map((singer, i) => {
    const prev = sorted[i - 1];
    if (!prev || value(prev) !== value(singer) || prev.sum !== singer.sum) rank = i + 1;
    return { singer, rank: value(singer) ? rank : '—' };
  });
});
const groups = computed(() => Object.entries(awardLabels).map(([award, label]) => ({
  award, label, names: (awards.value?.winners ?? []).filter(w => w.award === award).map(w => entrantName(w.id)),
  vacant: (awards.value?.vacancies ?? []).filter(v => v.award === award).reduce((sum,v) => sum + v.seats, 0),
})).filter(group => group.names.length || group.vacant));
const announcement = computed(() => {
  if (busy.value || stale.value || status.value.enabled || awards.value?.pending || !awards.value?.winners.length) return '';
  return [event.name + '获奖名单', '', ...groups.value.filter(group => group.names.length)
    .map(group => group.label + ' · ' + group.names.map(name => name.replace(/\s+/g, ' ').trim()).join('、'))].join('\n');
});
watch(announcement, () => { copyStatus.value = ''; manualCopy.value = false; });

async function load() {
  if (reading.value) return;
  reading.value = true;
  error.value = '';
  try {
    const next = await adminApi.getSingersVotes();
    if (!next.status) next.status = { enabled: await adminApi.getVotingEnabled() };
    data.value = next;
    selectedDraw.value = [];
    fetchedAt.value = time(Date.now());
    stale.value = false;
  } catch (err) {
    stale.value = true;
    if (err.status === 401) await router.replace('/admin');
    else error.value = data.value ? '刷新失败，当前显示上次读取的票数。' : (err.error || '暂时无法读取票数。');
  } finally { reading.value = false; }
}
async function logout() {
  if (busy.value) return;
  action.value = 'logout';
  try {
    await adminApi.logout();
    await router.replace('/admin');
  } catch { error.value = '退出未确认，请重试。'; }
  finally { action.value = ''; }
}
async function changePhase(target) {
  if (busy.value || stale.value || !permissions.value.manageVoting) return;
  const { round } = status.value;
  if (target === 'waiting' && phase.value !== 'closed') return;
  const prompt = target === 'waiting'
    ? '确认恢复为未开票？观众首页将显示「未到投票时间」。本轮选票和抽签记录保留，后台将切回等待状态。'
    : target === 'closed' ? '确认提前关闭本轮投票？' : round
    ? '确认开启新一轮 10 分钟投票？上一轮选票保留，新的轮次单独计票。' : '确认开启 10 分钟投票？';
  if (!confirm(prompt)) return;
  action.value = target;
  try {
    if (target === 'waiting') await adminApi.restoreWaiting(round);
    else await adminApi.setVotingEnabled(target === 'open', round ?? null);
    await load();
  } catch (err) { stale.value = true; error.value = err.error || '通道状态未确认，请刷新核对。'; }
  finally { action.value = ''; }
}
async function recordDraw() {
  const pending = awards.value?.pending;
  if (busy.value || stale.value || !permissions.value.resolveDraws || !pending || selectedDraw.value.length !== pending.seats) return;
  if (!confirm('确认记录抽签结果：' + selectedDraw.value.map(entrantName).join('、') + '？')) return;
  action.value = 'draw';
  try {
    await adminApi.recordDraw(status.value.round, pending.key, [...selectedDraw.value]);
    await load();
  } catch (err) { stale.value = true; error.value = err.error || '抽签结果未确认，请刷新核对。'; }
  finally { action.value = ''; }
}
async function copyAnnouncement() {
  try {
    await navigator.clipboard.writeText(announcement.value);
    copyStatus.value = '已复制宣读名单。'; manualCopy.value = false;
  } catch {
    manualCopy.value = true; copyStatus.value = '请手动复制下方名单。';
    await nextTick(); announcementField.value?.select();
  }
}
onMounted(load);
</script>

<template>
  <main class="ops-main">
    <header class="ops-heading">
      <h1>投票管理</h1>
      <div v-if="data" class="ops-account">
        <span>{{ data.username }}<small v-if="!permissions.manageVoting && !permissions.resolveDraws && !permissions.manageStaff">只读</small></span>
        <RouterLink v-if="permissions.manageStaff" to="/admin/staff">Staff 权限</RouterLink>
        <button type="button" class="ops-link" :disabled="busy" @click="logout">退出后台</button>
      </div>
    </header>
    <p v-if="!data && reading" class="ops-note" role="status">正在读取票数…</p>
    <div v-if="error" class="ops-alert" role="alert">{{ error }}
      <button type="button" class="ops-btn" :disabled="busy" @click="load">重新读取</button>
    </div>
    <template v-if="data">
      <section class="ops-channel" aria-labelledby="channel-heading">
        <div>
          <h2 id="channel-heading">投票通道</h2>
          <div class="ops-channel-line"><strong class="ops-phase" :data-phase="phase">{{ phaseLabel[phase] }}</strong>
            <span v-if="status.closesAt" class="ops-detail">截止 {{ time(status.closesAt) }}</span>
          </div>
        </div>
        <div v-if="permissions.manageVoting" class="ops-channel-line">
          <button v-if="phase === 'closed'" type="button" class="ops-btn" :disabled="busy || stale" @click="changePhase('waiting')">
            {{ action === 'waiting' ? '正在恢复…' : '恢复为未开票' }}
          </button>
          <button type="button" class="ops-btn" :class="phase === 'open' ? 'ops-stop' : 'ops-primary'"
            :disabled="busy || stale" @click="changePhase(phase === 'open' ? 'closed' : 'open')">
            {{ action === 'open' || action === 'closed' ? '正在更新…' : phase === 'open' ? '提前关闭投票' : status.round ? '开启新一轮投票' : '开启 10 分钟投票' }}
          </button>
        </div>
      </section>
      <section v-if="awards" class="ops-awards" aria-labelledby="awards-heading">
        <div class="ops-toolbar">
          <h2 id="awards-heading">分奖结果</h2>
          <button v-if="announcement" type="button" class="ops-btn" @click="copyAnnouncement">复制宣读名单</button>
        </div>
        <p v-if="!awards.winners.length && !awards.pending" class="ops-note">本轮没有有效得票对象。</p>
        <dl v-if="groups.length" class="ops-results">
          <div v-for="group in groups" :key="group.award"><dt>{{ group.label }}</dt>
            <dd>{{ group.names.join('、') }} <span v-if="group.vacant" class="ops-detail">空缺 {{ group.vacant }} 席</span></dd></div>
        </dl>
        <p v-if="copyStatus" role="status">{{ copyStatus }}</p>
        <textarea v-if="manualCopy" ref="announcementField" class="ops-copy" :value="announcement" aria-label="宣读名单" rows="8" readonly />
        <section v-if="awards.pending" class="ops-draw">
          <h3>{{ awardLabels[awards.pending.award] }} · 等待抽签</h3>
          <form v-if="permissions.resolveDraws" @submit.prevent="recordDraw">
            <p>请复核票数和资格，然后勾选抽中的 {{ awards.pending.seats }} 个对象。</p>
            <label v-for="id in awards.pending.candidates" :key="id" class="ops-check">
              <input v-model="selectedDraw" type="checkbox" :value="id" :disabled="busy || stale"> {{ entrantName(id) }}
            </label>
            <button class="ops-btn ops-primary" :disabled="busy || stale || selectedDraw.length !== awards.pending.seats">记录抽签结果</button>
          </form>
          <p v-else>{{ awards.pending.candidates.map(entrantName).join('、') }}</p>
        </section>
        <details v-if="Object.keys(data.draws ?? {}).length"><summary>已记录的抽签结果</summary>
          <ul><li v-for="(ids, key) in data.draws" :key="key">
            {{ key.endsWith(':nov18') ? '' : '旧规则 · ' }}{{ awardLabels[key.split(':')[0]] }}（第 {{ key.split(':')[1] }} 席起） · {{ ids.map(entrantName).join('、') }}
          </li></ul>
        </details>
      </section>
      <section class="ops-tallies" aria-labelledby="tallies-heading">
        <div class="ops-toolbar">
          <div><h2 id="tallies-heading">票数统计</h2><p class="ops-detail">{{ rows.length }} 组参赛 · 共 {{ total }} 票</p></div>
          <div class="ops-refresh"><span class="ops-detail">{{ fetchedAt }} 更新</span>
            <button class="ops-btn" type="button" :disabled="busy" @click="load">{{ reading ? '读取中…' : '刷新票数' }}</button>
          </div>
        </div>
        <table class="ops-table" aria-labelledby="tallies-heading">
          <thead><tr><th scope="col" class="ops-rank">名次</th><th scope="col" class="ops-name">参赛对象</th>
            <th v-for="col in columns" :key="col.key" scope="col" class="ops-num" :aria-sort="selectedSort === col.key ? 'descending' : undefined">
              <button type="button" :aria-label="'按' + col.label + '降序排列'" @click="selectedSort = col.key">
                {{ col.label }}<span v-if="selectedSort === col.key" aria-hidden="true">↓</span>
              </button>
            </th>
          </tr></thead>
          <tbody><tr v-for="{ singer, rank } in rows" :key="singer.id">
            <td class="ops-rank">{{ rank }}</td>
            <th scope="row" class="ops-name"><div class="ops-performer">
              <img v-if="coverUrl(singer.songs[0]?.cover)" :src="coverUrl(singer.songs[0].cover)" width="36" height="36" loading="lazy" alt="">
              <div><small v-if="singer.furigana">{{ singer.furigana }}</small><strong>{{ singer.name }}</strong>
                <small v-if="singer.songs.length">{{ singer.songs.map(song => song.name).join(' / ') }}</small>
                <small v-if="singer.description">{{ singer.description }}</small></div>
            </div></th>
            <td v-for="col in columns" :key="col.key" class="ops-num" :class="{ 'ops-sorted': selectedSort === col.key }">{{ score(singer, col.key) }}</td>
          </tr></tbody>
        </table>
      </section>
    </template>
  </main>
</template>

