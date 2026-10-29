import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import routes from './routes';


export default defineRouter(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : (process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory);

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Configurations related to history mode
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  // Global Navigation Guard
  Router.beforeEach((to, from, next) => {
    const hasToken = !!localStorage.getItem('authToken');
    const isVerified = localStorage.getItem('isVerified') === 'true';

    if (to.meta.requiresAuth) {
      if (!hasToken) {
        // No token at all → login
        next('/login');
      } else if (!isVerified && to.path !== '/register_verify') {
        // Token exists but account not verified → force verify
        next('/register_verify');
      } else {
        next();
      }
    } else {
      next();
    }
  });

  return Router;
});
