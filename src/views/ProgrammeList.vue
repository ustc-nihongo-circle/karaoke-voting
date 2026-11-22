<script setup>
import { computed, nextTick, ref } from 'vue';
import { coverUrl } from '@/utils/coverUrl';
import { useShortlist } from '@/utils/useShortlist';

const props = defineProps({ sections: Array, singers: Array, allowMarking: Boolean, canVote: Boolean, ballot: Object });
const { eligible, marked, expired, temporary, toggleMark } = useShortlist();
const half = ref(1);
const onlyMarked = ref(false);
const filtered = computed(() => onlyMarked.value && !expired.value);
const groups = computed(() => {
  const entries = props.singers.flatMap(singer => singer.songs.map(song => ({ singer, song })))
    .sort((a, b) => a.song.number - b.song.number);
  return props.sections.filter(section => filtered.value || section.half === half.value)
    .map(section => ({ section, entries: entries.filter(({ singer, song }) =>
      song.half === section.half && (!filtered.value || marked.value.has(singer.id))) }))
    .filter(group => group.entries.length);
});
const outsideVotes = computed(() => Object.values(props.ballot ?? {})
  .reduce((sum, ids) => sum + ids.filter(id => !marked.value.has(id)).length, 0));
const nav = ref(null);
const anchor = ref(null);
const savedTab = ref(null);

async function changeView(number, favorites) {
  const pinned = nav.value?.getBoundingClientRect().top <= 0;
  half.value = number;
  onlyMarked.value = favorites;
  await nextTick();
  if (pinned) anchor.value?.scrollIntoView({ block: 'start' });
}
async function mark(id, event) {
  const moveFocus = filtered.value && document.activeElement === event.currentTarget;
  const buttons = moveFocus ? [...nav.value.parentElement.querySelectorAll('.mark-song')] : [];
  const index = buttons.indexOf(event.currentTarget);
  toggleMark(id);
  if (moveFocus) {
    await nextTick();
    const remaining = nav.value.parentElement.querySelectorAll('.mark-song');
    (remaining[Math.min(index, remaining.length - 1)] ?? savedTab.value)?.focus({ preventScroll: true });
  }
}
</script>

<template>
  <div ref="anchor" class="list-anchor" aria-hidden="true"></div>
  <div ref="nav" class="programme-nav">
    <nav v-if="!expired" class="shortlist-tabs" aria-label="节目显示范围">
      <button type="button" :aria-pressed="!filtered" @click="changeView(half, false)">全部节目</button>
      <button ref="savedTab" type="button" :aria-pressed="filtered" @click="changeView(half, true)">
        <span aria-hidden="true">★</span> {{ allowMarking ? '查看想投' : '只看想投' }}（{{ marked.size }}）
      </button>
    </nav>
    <nav v-if="!filtered" class="halves" aria-label="演出段落" :style="{ '--sections': sections.length }">
      <button v-for="section in sections" :key="section.half" type="button" :aria-pressed="section.half === half"
        @click="changeView(section.half, false)">
        <span>SIDE <b>{{ section.side }}</b></span><small>{{ section.caption }}</small>
      </button>
    </nav>
  </div>
  <p v-if="!expired && (allowMarking || filtered || temporary)" class="mark-note">
    <span v-if="temporary" role="status">如更换浏览器等清除缓存可能丢失标记，请注意保存</span>
    <span v-else-if="allowMarking">{{ marked.size ? '注意「☆想投」标记不是正式投票' : '通过「☆想投」标记中途感兴趣的曲目' }}</span>
    <br v-if="allowMarking || temporary">
    <span>换设备或浏览器后仍可正常投票，但看不到之前的「想投」标记。</span>
  </p>
  <p v-if="filtered && outsideVotes" class="mark-note" role="status">清单外还有 {{ outsideVotes }} 票，已计入下方票额。</p>
  <div v-if="filtered && !groups.length" class="shortlist-empty">
    <h2>还没有想投的节目</h2>
    <p v-if="allowMarking">用「☆想投」标记感兴趣的曲目吧！</p>
    <p v-else-if="canVote">暂无想投标记，切回即可继续投票</p>
    <p v-else>切回「全部节目」可查看参赛曲目。</p>
    <button class="secondary" type="button" @click="changeView(half, false)">查看全部节目</button>
  </div>
  <section v-for="{ section, entries } in groups" :key="section.half" class="set" :class="{ 'voting-list': !!$slots.default, 'marked-section': filtered }">
    <header class="section-band">
      <div>
        <h2>{{ section.title }} <span>「{{ section.caption }}」</span></h2>
        <p>{{ section.theme }} · {{ filtered ? '想投 ' : '' }}{{ entries.length }} 首</p>
      </div>
      <span class="side-mark" aria-hidden="true"><b>{{ section.side }}</b><small>SIDE</small></span>
    </header>
    <ol class="entries">
      <li v-for="{ singer, song } in entries" :key="song.number" class="entry-card" :value="song.number">
        <div class="entry-top">
          <img v-if="coverUrl(song.cover)" class="song-cover" :src="coverUrl(song.cover)" alt="" width="88" height="88" loading="lazy" decoding="async">
          <div class="song">
            <h3>{{ song.name }}</h3>
            <p v-if="song.translation">{{ song.translation }}</p>
            <p class="performer">{{ singer.name }}</p>
          </div>
          <div class="track-actions">
            <span class="number">{{ song.number < 0 ? '−' + Math.abs(song.number) : String(song.number).padStart(2, '0') }}</span>
            <button v-if="allowMarking && !expired && eligible.has(singer.id)" class="mark-song" type="button"
              :aria-label="song.name + ' 想投'" :aria-pressed="marked.has(singer.id)" @click="mark(singer.id, $event)">
              <span aria-hidden="true">{{ marked.has(singer.id) ? '★' : '☆' }}</span>{{ marked.has(singer.id) ? '已标记' : '想投' }}
            </button>
            <span v-else-if="!allowMarking && marked.has(singer.id)" class="vote-mark" aria-label="已标记想投">★</span>
          </div>
        </div>
        <slot :singer="singer" />
      </li>
    </ol>
  </section>
</template>

