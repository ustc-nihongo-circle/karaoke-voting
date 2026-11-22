import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import VoteView from '@/views/VoteView.vue'
import AdminLoginView from '@/views/AdminLoginView.vue'
import AdminStatsView from '@/views/AdminStatsView.vue'
import ProgrammeView from '@/views/ProgrammeView.vue'
import StaffPermissionsView from '@/views/StaffPermissionsView.vue'
import { api } from '@/utils/useGlobalStorage'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/vote',
      name: 'vote',
      component: VoteView,
      beforeEnter: () => api.getStudentId() ? true : '/',
    },
    {
      path: '/programme',
      name: 'programme',
      component: ProgrammeView,
    },
    {
      path: '/admin',
      name: 'admin-login',
      component: AdminLoginView,
    },
    {
      path: '/admin/stats',
      name: 'admin-stats',
      component: AdminStatsView,
    },
    {
      path: '/admin/staff',
      name: 'staff-permissions',
      component: StaffPermissionsView,
    }
  ],
})

export default router
