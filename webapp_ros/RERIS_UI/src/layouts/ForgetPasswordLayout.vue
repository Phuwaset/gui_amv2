<template>
    <q-layout>
        <q-header elevated>
            <q-toolbar class="flex text-center">
                <q-toolbar-title class="login-header-label">
                    Reris
                </q-toolbar-title>
                <!-- This div will now use the fixed CSS -->
                <!-- <div class=>Quasar xxx</div> -->
            </q-toolbar>
        </q-header>

        <q-page-container>
            <router-view />
        </q-page-container>
    </q-layout>
</template>
  

<script setup lang="ts">
import '../css/login.css';
</script>