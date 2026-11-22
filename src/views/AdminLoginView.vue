<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '@/utils/useGlobalStorage';

const router = useRouter();
const username = ref('');
const password = ref('');

const loading = ref(false);
const failMsg = ref('');

async function go() {
  if (loading.value || !username.value || !password.value) return;
  loading.value = true;
  failMsg.value = '';
  try {
    await adminApi.login(username.value, password.value);
    await router.replace('/admin/stats');
  } catch (err) {
    failMsg.value = err.error || '登录失败，请重试。';
  } finally {
    password.value = '';
    loading.value = false;
  }
}

</script>

<template>
  <main class="ops-login">
    <div class="ops-login-art" aria-hidden="true"></div>
    <div class="ops-login-body">
      <h1>工作人员登录</h1>
      <form class="ops-form" @submit.prevent="go">
        <label for="admin-user">管理账号</label>
        <input id="admin-user" v-model.trim="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
        <label for="admin-password">管理员密码</label>
        <input id="admin-password" v-model="password" type="password" autocomplete="current-password" required>
        <p v-if="failMsg" class="ops-alert" role="alert">{{ failMsg }}</p>
        <button class="ops-btn ops-primary" :disabled="!username || !password || loading">{{ loading ? '正在登录…' : '登录后台' }}</button>
      </form>
    </div>
  </main>
</template>
