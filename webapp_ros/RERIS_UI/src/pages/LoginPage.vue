<template>
  <q-page class="row items-center justify-evenly" style="background-color: #f5f5f5;">

    <!-- ── Ban overlay ── -->
    <div v-if="banError" class="ban-overlay">
      <div class="ban-card">
        <q-icon name="block" size="48px" color="red-5" />
        <div class="ban-title">Account Banned</div>
        <div class="ban-message">{{ banError }}</div>
      </div>
    </div>

    <div v-if="!banError">
      <div class="column items-center no-select" style="height: 150px;">
        <div class="flex text-center">
          <div class="login-header-title-label no-warp red-hat-normal-font">RERIS</div>
        </div>
        <div class="flex text-center">
          <div class="login-header-subtitle-label red-hat-normal-font">Robotics Interface System</div>
        </div>
      </div>

      <div class="column" style="height: 150px">
        <!-- Username Field -->
        <div class="col red-hat-normal-font">
          <div class="login-username-label red-hat-normal-font">Username or Email</div>
          <div class="q-gutter-md" style="width: 350px;">
            <q-input v-model="username" rounded outlined bg-color="white" :error="!!usernameError"
              :error-message="usernameError" />
          </div>
        </div>
        <br>
        <br>
        <br>
        <!-- Password Field -->
        <div class="col red-hat-normal-font">
          <div class="red-hat-normal-font">Password</div>
          <div class="q-gutter-md" style="top: 30px width: 350px">
            <q-input v-model="password" type="password" rounded outlined bg-color="white" :error="!!passwordError"
              :error-message="passwordError" />
          </div>
        </div>
      </div>
      <br>

      <!-- Forget Password and Signup Options -->
      <div class="column items-center" style="height: 180px;">
        <br>
        <div class="login-header-forget-label red-hat-normal-font">
          <div>
            <br>
            <div @click="goToSignUp">If you don’t have any account. Click here.</div>
          </div>
          <br>
          <div @click="goToForgetPassword">Forget password?</div>
        </div>
        <br>
        <!-- Sign In Button -->
        <div class="flex text-center">
          <q-btn class="login-header-button-sign-in red-hat-normal-font" no-caps push color="green" label="Sign in"
            style="width: 100px;" @click="handleLogin" />
        </div>
      </div>
    </div><!-- /v-if="!banError" -->
  </q-page>
</template>

<script setup lang="ts">
import { ref , onMounted  } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import '../css/login.css';
import axios from 'axios';
import { server_api_config } from 'src/configs/server';

const username = ref('');
const password = ref('');
const usernameError = ref('');
const passwordError = ref('');
const banError = ref('');
const router = useRouter();
const route  = useRoute();

onMounted(() => {
  // Redirect from MainLayout when a live session is detected as banned
  if (route.query.banned === '1') {
    banError.value = 'You are banned by administrator. If you want to know why, ask him.';
    return;
  }

  const token = localStorage.getItem('authToken');
  const isVerified = localStorage.getItem('isVerified') === 'true';
  if (token && isVerified) {
    void router.push('/');
  } else if (token && !isVerified) {
    // Token exists but not verified → force security code page
    void router.push('/register_verify');
  }
});


const goToSignUp = async () => {
  try {
    await router.push('/register'); // Replace '/sign-up' with your actual sign-up route
  } catch (error) {
    console.error('Navigation error:', error);
  }
};

const goToForgetPassword = async () => {
  try {
    await router.push('/forget_password'); // Replace '/sign-up' with your actual sign-up route
  } catch (error) {
    console.error('Navigation error:', error);
  }
}


const handleLogin = async () => {
  let valid = true;

  // Validate username
  if (!username.value.trim()) {
    usernameError.value = 'Username or Email is required.';
    valid = false;
  } else if (username.value.length < 3) {
    usernameError.value = 'Username must be at least 3 characters long.';
    valid = false;
  } else {
    usernameError.value = '';
  }

  // Validate password
  if (!password.value.trim()) {
    passwordError.value = 'Password is required.';
    valid = false;
  } else if (password.value.length < 6) {
    passwordError.value = 'Password must be at least 6 characters long.';
    valid = false;
  } else {
    passwordError.value = '';
  }

  // If valid, call login API
  if (valid) {
    try {
      const response = await axios.post(`http://${server_api_config.ip}:${server_api_config.port}/api/auth/login`, {
        Username: username.value,
        password: password.value,
      });

      if (response.data && response.data.error === 'banned') {
        banError.value = response.data.message as string;
      } else if (response.data && response.data.error === 'unverified') {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('username', username.value);
        localStorage.removeItem('isVerified'); // ensure flag is clear
        await router.push('/register_verify');
      } else if (response.data && response.data.error) {
        usernameError.value = response.data.message || 'Login failed.';
      } else if (response.data && response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('username', username.value);
        localStorage.setItem('isVerified', 'true'); // account is verified
        console.log('Login successful:', response.data.message);
        await router.push('/');
      } else {
        // Handle unexpected response format
        console.error('Unexpected response:', response.data);
        usernameError.value = 'Login failed. Please try again.';
      }
    } catch (error) {
      // Handle API errors
      console.error('Login error:', error);
      if (axios.isAxiosError(error) && error.response && error.response.data) {
        const data = error.response.data as { message?: string };
        if (data.message) {
          usernameError.value = data.message;
          return;
        }
      }
      usernameError.value = 'Login failed. Please check your credentials.';
    }
  }
}
</script>

<style scoped>
.ban-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.ban-card {
  background: #1c1c1e;
  border: 1px solid rgba(255, 69, 58, 0.4);
  border-radius: 20px;
  padding: 48px 40px;
  max-width: 420px;
  width: 90%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  box-shadow: 0 0 40px rgba(255, 69, 58, 0.25);
}

.ban-title {
  font-size: 22px;
  font-weight: 700;
  color: #ff453a;
  letter-spacing: 0.02em;
}

.ban-message {
  font-size: 15px;
  color: #aeaeb2;
  line-height: 1.6;
}
</style>
