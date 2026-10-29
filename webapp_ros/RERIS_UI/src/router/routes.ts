// import type { RouteRecordRaw } from 'vue-router'; // Import as a type to fix ESLint issues

// // Define the application's routes
// const routes: RouteRecordRaw[] = [
//   {
//     path: '/',
//     component: () => import('layouts/MainLayout.vue'),
//     children: [{ path: '', component: () => import('components/assets/map/MapAsset.vue') }],
//     meta: { requiresAuth: true }, // Protect this route
//   },
//   {
//     path: '/maps',
//     component: () => import('layouts/MainLayout.vue'),
//     children: [{ path: '', component: () => import('pages/maps/MapComponent/MapComponent.vue') }],
//     meta: { requiresAuth: true }, // Protect this route
//   },
//   {
//     path: '/login',
//     component: () => import('layouts/LoginLayout.vue'),
//     children: [{ path: '', component: () => import('pages/LoginPage.vue') }],
//   },
//   {
//     path: '/register',
//     component: () => import('layouts/LoginLayout.vue'),
//     children: [{ path: '', component: () => import('pages/RegisterPage.vue') }],
//   },
//   {
//     path: '/forget_password',
//     component: () => import('layouts/ForgetPasswordLayout.vue'),
//     children: [{ path: '', component: () => import('pages/ForgetPasswordPage.vue') }],
//   },
//   {
//     path: '/register_verify',
//     component: () => import('layouts/LoginLayout.vue'),
//     children: [{ path: '', component: () => import('pages/RegisterVerifyPage.vue') }],
//   },
//   {
//     path: '/:catchAll(.*)*',
//     component: () => import('pages/ErrorNotFound.vue'),
//   },
// ];

// export default routes;


// // src/router/routes.ts
// import type { RouteRecordRaw } from 'vue-router';

// type MapMode = 'visualize' | 'edit' | 'record';
// const asMode = (v: unknown): MapMode => (['visualize','edit','record'].includes(String(v)) ? (v as MapMode) : 'visualize');

// const routes: RouteRecordRaw[] = [
//   {
//     path: '/',
//     component: () => import('layouts/MainLayout.vue'),
//     // ถ้ายังอยากให้หน้าแรกเป็น MapAsset ได้อยู่
//     children: [{
//       path: '',
//       name: 'HomeMap',
//       component: () => import('components/assets/map/MapAsset.vue'),
//       props: route => ({
//         mapName: (route.query.mapName as string) || '',
//         mapSite: (route.query.mapSite as string) || '',
//         mode: asMode(route.query.mode)
//       })
//     }],
//     meta: { requiresAuth: true },
//   },

//   {
//     path: '/maps',
//     component: () => import('layouts/MainLayout.vue'),
//     children: [{
//       path: '',
//       name: 'MapsList',
//       component: () => import('pages/maps/MapComponent/MapComponent.vue')
//     }],
//     meta: { requiresAuth: true },
//   },

//   /* ---------- Map Viewer routes (controlled props -> MapAsset) ---------- */
//   {
//     path: '/map/:siteName/:mapName',
//     component: () => import('layouts/MainLayout.vue'),
//     children: [{
//       path: '',
//       name: 'MapView',
//       component: () => import('components/assets/map/MapTemplate.vue'),
//       // รับ mode จาก query ?mode=visualize|edit|record
//       props: route => ({
//         mapName: route.params.mapName as string,
//         mapSite: route.params.siteName as string,
//         mode: asMode(route.query.mode)
//       })
//     }],
//     meta: { requiresAuth: true },
//   },

//   {
//     path: '/map/:siteName/:mapName/edit',
//     component: () => import('layouts/MainLayout.vue'),
//     children: [{
//       path: '',
//       name: 'MapEdit',
//       component: () => import('components/assets/map/MapTemplate.vue'),
//       props: route => ({
//         mapName: route.params.mapName as string,
//         mapSite: route.params.siteName as string,
//         mode: 'edit' as MapMode
//       })
//     }],
//     meta: { requiresAuth: true },
//   },

//   {
//     path: '/map/:siteName/:mapName/record',
//     component: () => import('layouts/MainLayout.vue'),
//     children: [{
//       path: '',
//       name: 'MapRecord',
//       component: () => import('components/assets/map/MapTemplate.vue'),
//       props: route => ({
//         mapName: route.params.mapName as string,
//         mapSite: route.params.siteName as string,
//         mode: 'record' as MapMode,
//         recording: true
//       })
//     }],
//     meta: { requiresAuth: true },
//   },

//   /* ---------------- Auth pages ---------------- */
//   {
//     path: '/login',
//     component: () => import('layouts/LoginLayout.vue'),
//     children: [{ path: '', name: 'Login', component: () => import('pages/LoginPage.vue') }],
//   },
//   {
//     path: '/register',
//     component: () => import('layouts/LoginLayout.vue'),
//     children: [{ path: '', name: 'Register', component: () => import('pages/RegisterPage.vue') }],
//   },
//   {
//     path: '/forget_password',
//     component: () => import('layouts/ForgetPasswordLayout.vue'),
//     children: [{ path: '', name: 'ForgetPassword', component: () => import('pages/ForgetPasswordPage.vue') }],
//   },
//   {
//     path: '/register_verify',
//     component: () => import('layouts/LoginLayout.vue'),
//     children: [{ path: '', name: 'RegisterVerify', component: () => import('pages/RegisterVerifyPage.vue') }],
//   },

//   /* 404 */
//   {
//     path: '/:catchAll(.*)*',
//     name: 'NotFound',
//     component: () => import('pages/ErrorNotFound.vue'),
//   },
// ];


// src/router/routes.ts
// Updated to route directly to MapAsset.vue

import type { RouteRecordRaw } from 'vue-router';

type MapMode = 'visualize' | 'edit' | 'record';
const asMode = (v: unknown): MapMode => 
  (['visualize','edit','record'].includes(String(v)) ? (v as MapMode) : 'visualize');

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [{
      path: '',
      name: 'HomeMap',
      // Dashboard now loads the Navigator component to match dashboard.png design
      component: () => import('pages/NavigatorPage.vue'),
    }],
    meta: { requiresAuth: true },
  },

  {
    path: '/maps',
    component: () => import('layouts/MainLayout.vue'),
    children: [{
      path: '',
      name: 'MapsList',
      component: () => import('pages/maps/MapComponent/MapComponent.vue')
    }],
    meta: { requiresAuth: true },
  },

  {
    path: '/navigator',
    component: () => import('layouts/MainLayout.vue'),
    children: [{
      path: '',
      name: 'Navigator',
      component: () => import('pages/NavigatorPage.vue')
    }],
    meta: { requiresAuth: true },
  },

  {
    path: '/routine',
    component: () => import('layouts/MainLayout.vue'),
    children: [{
      path: '',
      name: 'Routine',
      component: () => import('pages/RoutinePage.vue')
    }],
    meta: { requiresAuth: true },
  },

  {
    path: '/profile',
    component: () => import('layouts/MainLayout.vue'),
    children: [{
      path: '',
      name: 'Profile',
      component: () => import('pages/ProfilePage.vue')
    }],
    meta: { requiresAuth: true },
  },

  {
    path: '/settings',
    component: () => import('layouts/MainLayout.vue'),
    children: [{
      path: '',
      name: 'Settings',
      component: () => import('pages/SettingsPage.vue')
    }],
    meta: { requiresAuth: true },
  },

  /* ---------- Map Viewer routes (direct to MapAsset) ---------- */
  {
    path: '/map/:siteName/:mapName',
    component: () => import('layouts/MappingLayout.vue'),
    children: [{
      path: '',
      name: 'MapView',
      // 👇 Direct to MapAsset.vue
      component: () => import('components/assets/map/MapAsset.vue'),
      props: route => ({
        mapName: route.params.mapName as string,
        mapSite: route.params.siteName as string,
        mode: asMode(route.query.mode)
      })
    }],
    meta: { requiresAuth: true },
  },

  {
    path: '/map/:siteName/:mapName/edit',
    component: () => import('layouts/MappingLayout.vue'),
    children: [{
      path: '',
      name: 'MapEdit',
      // 👇 Direct to MapAsset.vue
      component: () => import('components/assets/map/MapAsset.vue'),
      props: route => ({
        mapName: route.params.mapName as string,
        mapSite: route.params.siteName as string,
        mode: 'edit' as MapMode
      })
    }],
    meta: { requiresAuth: true },
  },

  {
    path: '/map/:siteName/:mapName/record',
    component: () => import('layouts/MappingLayout.vue'),
    children: [{
      path: '',
      name: 'MapRecord',
      // 👇 Direct to MapAsset.vue
      component: () => import('components/assets/map/MapAsset.vue'),
      props: route => ({
        mapName: route.params.mapName as string,
        mapSite: route.params.siteName as string,
        mode: 'record' as MapMode,
        recording: false
      })
    }],
    meta: { requiresAuth: true },
  },

  /* ---------------- Auth pages ---------------- */
  {
    path: '/login',
    component: () => import('layouts/LoginLayout.vue'),
    children: [{ path: '', name: 'Login', component: () => import('pages/LoginPage.vue') }],
  },
  {
    path: '/register',
    component: () => import('layouts/LoginLayout.vue'),
    children: [{ path: '', name: 'Register', component: () => import('pages/RegisterPage.vue') }],
  },
  {
    path: '/forget_password',
    component: () => import('layouts/ForgetPasswordLayout.vue'),
    children: [{ path: '', name: 'ForgetPassword', component: () => import('pages/ForgetPasswordPage.vue') }],
  },
  {
    path: '/register_verify',
    component: () => import('layouts/LoginLayout.vue'),
    children: [{ path: '', name: 'RegisterVerify', component: () => import('pages/RegisterVerifyPage.vue') }],
  },

  /* 404 */
  {
    path: '/:catchAll(.*)*',
    name: 'NotFound',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
