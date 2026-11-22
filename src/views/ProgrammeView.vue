<script setup>
import event from '../../event.json';
import { guests, sections, singers } from '../../roster-2026.mjs';
import ProgrammeList from './ProgrammeList.vue';
const programme = [...guests, ...singers];
</script>

<template>
  <main>
    <header class="page-header">
      <div class="page-copy">
        <div class="page-topline">{{ event.date }} <span>{{ event.venue }}</span></div>
        <h1>演出节目单</h1>
      </div>
      <div class="page-art" aria-hidden="true"></div>
    </header>
    <ProgrammeList :sections="sections" :singers="programme" allow-marking />
  </main>
</template>

