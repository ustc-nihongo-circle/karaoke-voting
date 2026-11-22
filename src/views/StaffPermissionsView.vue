<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '@/utils/useGlobalStorage';

const router = useRouter();
const accounts = ref([]);
const loading = ref(false);
const saving = ref('');
const error = ref('');
const notice = ref('');

function editable(account) {
  return account.enabled && account.username !== 'owner' && account.username !== 'staff_public';
}

async function load() {
  if (loading.value || saving.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { accounts: rows } = await adminApi.listStaff();
    accounts.value = rows.map(row => ({ ...row, before: { manageVoting: row.manageVoting, resolveDraws: row.resolveDraws } }));
  } catch (err) {
    if (err.status === 401) await router.replace('/admin');
    else error.value = err.error || '权限列表暂不可用。';
  } finally {
    loading.value = false;
  }
}

async function save(account) {
  if (loading.value || saving.value || !editable(account)) return;
  saving.value = account.username;
  error.value = '';
  notice.value = '';
  const after = { manageVoting: account.manageVoting, resolveDraws: account.resolveDraws };
  try {
    await adminApi.updateStaffPermissions(account.username, account.before, after);
    account.before = after;
    notice.value = `已保存 ${account.username} 的权限。`;
  } catch (err) {
    if (err.status === 401) await router.replace('/admin');
    else error.value = err.error || '保存失败，请重试。';
  } finally {
    saving.value = '';
  }
}

onMounted(load);
</script>

<template>
  <main class="ops-main">
    <header class="ops-heading"><h1>Staff 权限</h1><RouterLink class="ops-back" to="/admin/stats">返回投票管理</RouterLink></header>
    <p v-if="loading" class="ops-note" role="status">正在读取账号…</p>
    <div v-if="error" class="ops-alert" role="alert">{{ error }}
      <button type="button" class="ops-btn" @click="load" :disabled="loading || !!saving">重新载入</button>
    </div>
    <p v-if="notice" class="ops-feedback" role="status">{{ notice }}</p>
    <div class="ops-staff-list">
      <form v-for="account in accounts" :key="account.username" @submit.prevent="save(account)">
        <fieldset :disabled="!editable(account) || !!saving || loading" :aria-label="account.username + ' 的权限'">
          <div class="ops-staff-account"><strong>{{ account.username }}</strong>
            <span v-if="!editable(account)" class="ops-detail">{{ account.enabled ? '固定权限' : '账号已停用' }}</span>
          </div>
          <label class="ops-check"><input v-model="account.manageVoting" type="checkbox"> 开关投票</label>
          <label class="ops-check"><input v-model="account.resolveDraws" type="checkbox"> 录入抽签结果</label>
          <button v-if="editable(account)" class="ops-btn" :disabled="account.manageVoting === account.before.manageVoting && account.resolveDraws === account.before.resolveDraws">{{ saving === account.username ? '保存中…' : '保存权限' }}</button>
        </fieldset>
      </form>
    </div>
  </main>
</template>
