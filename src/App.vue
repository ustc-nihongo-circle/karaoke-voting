<script setup>
import event from '../event.json';
import { computed, ref, watchPostEffect } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { mountProgrammeMesh } from './utils/programmeMesh';
import './assets/karaoke-audience.css';
import './assets/karaoke-admin.css';
import theme from '@audience-theme';

const route = useRoute();
const audience = computed(() => ['home', 'programme', 'vote'].includes(route.name));
const mesh = ref(null);
watchPostEffect(cleanup => {
  if (mesh.value) cleanup(mountProgrammeMesh(mesh.value));
});
</script>

<template>
  <div v-if="audience" class="karaoke-audience" :class="[theme.audience, { 'audience-inner': route.name !== 'home' }]">
    <canvas v-if="route.name !== 'home'" id="scene-mesh" ref="mesh" aria-hidden="true"></canvas>
    <div class="site">
      <header class="site-header">
        <RouterLink class="brand" to="/"><b>♪</b> {{ event.brand }}</RouterLink>
        <RouterLink v-if="route.name === 'home'" to="/programme">节目单</RouterLink>
        <RouterLink v-else to="/">{{ route.name === 'programme' ? '进入正式投票' : '投票首页' }}</RouterLink>
      </header>
      <RouterView />
    </div>
  </div>
  <div v-else class="karaoke-audience staff-shell">
    <div class="site">
      <header class="site-header">
        <RouterLink class="brand" to="/"><b>♪</b> {{ event.brand }}</RouterLink>
        <RouterLink to="/">观众首页</RouterLink>
      </header>
      <RouterView />
    </div>
  </div>
</template>

<style>
body { margin: 0; background: #101321; }
</style>
