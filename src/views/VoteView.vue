<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { api } from '@/utils/useGlobalStorage';
import { leaveDialog } from '@/utils/leaveDialog';
import ProgrammeList from './ProgrammeList.vue';

const singers = ref([]);
const sections = ref([]);
const voteTypes = ref([]);
const selected = ref({});
const saved = ref({});
const round = ref(null);
const remaining = ref(0);
const loading = ref(true);
const saving = ref(false);
const loadError = ref('');
const notice = ref('');
const noticeKind = ref('');
const review = ref(null);
const canVote = computed(() => !loading.value && !loadError.value && remaining.value > 0 && !!round.value);
const choices = computed(() => canVote.value ? selected.value : saved.value);
const hasChoices = computed(() => voteTypes.value.some(type => choices.value[type.name]?.length));
const changed = computed(() => voteTypes.value.some(({ name }) => {
  const current = selected.value[name] ?? [];
  const previous = saved.value[name] ?? [];
  return current.length !== previous.length || current.some(id => !previous.includes(id));
}));
const countdown = computed(() => Math.floor(remaining.value / 60) + ':' + String(remaining.value % 60).padStart(2, '0'));
const nameById = computed(() => new Map(singers.value.map(({ id, name }) => [id, name])));

let closesAt = 0;
let clockOffset = 0;
let timer;
let nextPoll = 0;
let statusPending = false;
let saveVersion = 0;
let active = true;

function copyVotes(votes) {
  return Object.fromEntries(Object.entries(votes ?? {}).map(([type, ids]) => [type, [...ids]]));
}

function clock() {
  remaining.value = Math.max(0, Math.ceil((closesAt - Date.now() - clockOffset) / 1000));
  if (!remaining.value && !saving.value && changed.value) {
    selected.value = copyVotes(saved.value);
    notice.value = '';
    noticeKind.value = '';
    leaveDialog(false);
  }
}

function sync(data, refreshVotes = false) {
  if (refreshVotes || round.value !== data.round) {
    selected.value = copyVotes(data.votes);
    saved.value = copyVotes(data.votes);
    notice.value = '';
    noticeKind.value = '';
    leaveDialog(false);
  }
  round.value = data.round;
  closesAt = Date.parse(data.closesAt) || 0;
  clockOffset = Date.parse(data.serverNow) - Date.now();
  clock();
}

async function poll() {
  if (statusPending || saving.value) return;
  statusPending = true;
  const previousVersion = saveVersion;
  nextPoll = Date.now() + (canVote.value ? 30000 : 10000) + Math.random() * 3000;
  try {
    const data = await api.getVotePageData();
    if (active && previousVersion === saveVersion) {
      const closed = Date.parse(data.closesAt) <= Date.parse(data.serverNow);
      if (round.value !== data.round) {
        singers.value = data.singers ?? [];
        sections.value = data.sections ?? [];
        voteTypes.value = data.vote_types ?? [];
      }
      sync(data, closed);
    }
  } catch {
    // Keep the last server deadline until the next poll.
  } finally {
    statusPending = false;
  }
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const data = await api.getVotePageData();
    if (!active) return;
    singers.value = data.singers ?? [];
    sections.value = data.sections ?? [];
    voteTypes.value = data.vote_types ?? [];
    sync(data, true);
  } catch {
    if (active) loadError.value = '暂时无法加载投票信息。';
  } finally {
    loading.value = false;
    nextPoll = Date.now() + 10000 + Math.random() * 3000;
  }
}

function isChosen(type, id) {
  return choices.value[type]?.includes(id) ?? false;
}

function toggle(type, id) {
  if (!canVote.value || saving.value) return;
  const ids = selected.value[type.name] ?? [];
  if (ids.includes(id)) {
    selected.value[type.name] = ids.filter(choice => choice !== id);
  } else if (ids.length < type.max_per_user) {
    selected.value[type.name] = [...ids, id];
  } else {
    notice.value = '「' + type.display_name + '」已满 ' + type.max_per_user + ' 票。';
    noticeKind.value = 'warning';
    return;
  }
  notice.value = '';
  noticeKind.value = '';
  leaveDialog(changed.value);
}

async function save() {
  if (!canVote.value || !hasChoices.value || !changed.value || saving.value) return;
  saving.value = true;
  saveVersion += 1;
  notice.value = '';
  noticeKind.value = '';
  const payload = copyVotes(selected.value);
  try {
    const data = await api.updateVote(payload, round.value);
    if (!active) return;
    if (data.success) {
      saved.value = payload;
      leaveDialog(false);
      notice.value = '投票已保存。';
      noticeKind.value = 'saved';
    } else {
      notice.value = '服务器未接收这次保存。请核对投票状态。';
      noticeKind.value = 'warning';
      nextPoll = 0;
    }
  } catch {
    if (active) {
      notice.value = '未能确认保存结果，请重试。';
      noticeKind.value = 'warning';
    }
  } finally {
    saving.value = false;
    if (active && !remaining.value) {
      clock();
      nextPoll = 0;
    }
  }
}

onBeforeRouteLeave(() => {
  if (saving.value) {
    notice.value = '正在保存投票，请稍候再离开。';
    noticeKind.value = 'warning';
    return false;
  }
  return !canVote.value || !changed.value || window.confirm('本次选票修改尚未保存，确认离开？');
});

onMounted(() => {
  load();
  timer = setInterval(() => {
    clock();
    if (!loading.value && !loadError.value && Date.now() >= nextPoll) poll();
  }, 1000);
});

onUnmounted(() => {
  active = false;
  clearInterval(timer);
  leaveDialog(false);
});
</script>

<template>
  <main>
    <header class="page-header">
      <div class="page-copy">
        <div class="page-topline">
          <span v-if="!loading && !loadError" class="status-pill" :data-state="canVote ? 'open' : 'closed'">
            {{ canVote ? '投票中' : round ? '已截止' : '未开票' }}
          </span>
          <time v-if="canVote" class="clock">{{ countdown }}</time>
        </div>
        <h1>我的投票</h1>
        <p>共三种分票，至少投出1票后保存。</p>
        <details>
          <summary>投票规则</summary>
          <p>综合/日语/歌唱每人总票数分别为5/3/3，全场公用票额、且同一节目可同时投多个票种。</p>
          <p>仅记录成功上传保存的投票记录，注意提交！</p>
        </details>
      </div>
      <div class="page-art" aria-hidden="true"></div>
    </header>
    <div v-if="loading || loadError" class="set" role="status">
      <p>{{ loadError || '正在加载投票…' }}</p>
      <button v-if="loadError" class="secondary" type="button" @click="load">重试</button>
    </div>
    <template v-else>
      <ProgrammeList :sections="sections" :singers="singers" :ballot="choices" :can-vote="canVote">
        <template #default="{ singer }">
          <div class="picks" role="group" :aria-label="singer.name + '的投票选项'">
            <button v-for="type in voteTypes" :key="type.name" class="pick" type="button"
              :aria-pressed="isChosen(type.name, singer.id)" :disabled="!canVote || saving" @click="toggle(type, singer.id)">
              <span class="check" aria-hidden="true">✓</span>{{ type.display_name }}
            </button>
          </div>
        </template>
      </ProgrammeList>
      <section class="ballot-dock" aria-label="投票操作">
        <div class="quota">
          <div v-for="type in voteTypes" :key="type.name" :data-full="choices[type.name]?.length === type.max_per_user">
            <span>{{ type.display_name }}</span><strong>{{ choices[type.name]?.length ?? 0 }}/{{ type.max_per_user }}</strong>
          </div>
        </div>
        <div class="dock-status">
          <p class="ballot-notice" role="status" :data-kind="noticeKind">
            {{ notice || (canVote ? changed ? '有更改尚未保存。' : hasChoices ? '当前选择已保存。' : '尚未选择。'
              : hasChoices ? '显示本轮最后保存的选择。' : round ? '本轮投票已结束。' : '未到投票时间。') }}
          </p>
          <time v-if="canVote" class="dock-clock" aria-label="剩余时间">{{ countdown }}</time>
        </div>
        <div class="dock-actions">
          <button type="button" class="secondary" :disabled="!hasChoices" @click="review.showModal()">核对选择</button>
          <button type="button" class="action" :disabled="!canVote || !changed || !hasChoices || saving" @click="save">
            {{ saving ? '正在保存…' : '保存投票' }}
          </button>
        </div>
      </section>
    </template>
    <dialog ref="review" aria-labelledby="review-heading">
      <header class="dialog-header">
        <h2 id="review-heading">核对选择</h2>
        <form method="dialog"><button class="minor">关闭</button></form>
      </header>
      <p>{{ canVote && changed ? '以下更改尚未保存。' : '以下是本轮已保存的选择。' }}</p>
      <template v-for="type in voteTypes" :key="type.name">
        <template v-if="choices[type.name]?.length">
          <h3 class="review-category">{{ type.display_name }} · {{ choices[type.name].length }}/{{ type.max_per_user }}</h3>
          <ul class="review-list"><li v-for="id in choices[type.name]" :key="id">{{ nameById.get(id) ?? id }}</li></ul>
        </template>
      </template>
    </dialog>
  </main>
</template>

