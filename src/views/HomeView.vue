<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import event from '../../event.json';
import { api, rememberStudentId } from '@/utils/useGlobalStorage';
import { useVotingStatus } from '@/utils/useVotingStatus';

const router = useRouter();
const studentId = ref(api.getStudentId() ?? '');
const invalidId = ref(false);
const { phase, countdown, error, refresh } = useVotingStatus();

function start() {
  if (phase.value !== 'open' || error.value) return;
  invalidId.value = !api.verifyStudentId(studentId.value);
  if (invalidId.value) return;
  api.setStudentId(studentId.value);
  rememberStudentId();
  router.push('/vote');
}
</script>

<template>
  <main class="home-content">
    <section class="hero">
      <div class="hero-title">
        <p>{{ event.edition }} <span>／</span> 现场投票</p>
        <h1>{{ event.name }}</h1>
        <div class="hero-meta"><strong>{{ event.date }}</strong><span>{{ event.venue }}<br>{{ event.schedule }}</span></div>
      </div>
    </section>
    <section class="home-panel" aria-labelledby="status-title">
      <div v-if="phase && !error" class="status-header">
        <span class="status-pill" :data-state="phase">{{ { waiting: '未开票', open: '投票中', closed: '已截止' }[phase] }}</span>
        <time v-if="phase === 'open'" class="clock">{{ countdown }}</time>
      </div>
      <h2 id="status-title">
        {{ error ? '暂时无法获取投票状态' : ({ waiting: '未到投票时间', open: '请填写学号', closed: '投票已结束' }[phase] ?? '正在查询投票状态…') }}
      </h2>
      <p v-if="phase === 'waiting' && !error">全部正场节目结束后统一开放，投票时间为 10 分钟。</p>
      <p v-else-if="phase === 'closed' && !error">本轮投票已截止，可以继续查看节目单。</p>
      <p v-if="phase === 'open' && !error">已有「☆想投」标记？可以尝试返回之前打开此网页的浏览器或应用继承标记。</p>
      <form v-if="phase === 'open' && !error" class="entry" @submit.prevent="start">
        <label for="student-id">学号</label>
        <input id="student-id" v-model.trim="studentId" placeholder="两位字母＋八位数字" autocomplete="off"
          autocapitalize="characters" spellcheck="false" :aria-invalid="invalidId"
          :aria-describedby="invalidId ? 'student-id-error' : undefined" required @input="invalidId = false">
        <button class="action" :disabled="!studentId">开始投票</button>
        <p v-if="invalidId" id="student-id-error" class="form-error" role="alert">请输入正确格式的学号。</p>
      </form>
      <button v-if="error" type="button" class="action status-retry" @click="refresh">重试</button>
      <RouterLink class="secondary" to="/programme">查看节目单</RouterLink>
    </section>
  </main>
  <footer class="footer">
    <span>{{ event.organizer }}</span>
    <RouterLink to="/admin">工作人员入口</RouterLink>
  </footer>
</template>

