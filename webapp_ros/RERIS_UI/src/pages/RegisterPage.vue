<template>
  <q-page class="row items-center justify-evenly" style="background-color: #f5f5f5;">
    <div>
      <div class="column items-center no-select" style="height: 150px;">
        <div class="flex text-center">
          <div class="login-header-title-label no-warp red-hat-normal-font">RERIS</div>
        </div>
        <div class="flex text-center">
          <div class="login-header-subtitle-label red-hat-normal-font">Robotics Interface System</div>
        </div>
      </div>

      <div class="column" style="height: 150px;">
        <div class="col red-hat-normal-font">
          <div class="login-username-label red-hat-normal-font">Username or Email</div>
          <div class="q-gutter-md" style="width: 350px;">
            <q-input v-model="username" rounded outlined bg-color="white" />
          </div>
        </div>
        <br><br>
        <div class="col red-hat-normal-font">
          <div class="red-hat-normal-font">Password</div>
          <div class="q-gutter-md" style="width: 350px;">
            <q-input v-model="password" type="password" rounded outlined bg-color="white" />
          </div>
        </div>
      </div>

      <br><br>
      <div class="column" style="height: 150px;">
        <div class="col red-hat-normal-font">
          <div class="login-username-label red-hat-normal-font">Confirm Password</div>
          <div class="q-gutter-md" style="width: 350px;">
            <q-input v-model="confirmPassword" type="password" rounded outlined bg-color="white" />
          </div>
        </div>
        <br><br>
        <div class="col red-hat-normal-font">
          <div class="red-hat-normal-font">Role</div>
          <div class="q-gutter-md" style="width: 350px;">
            <q-select v-model="role" rounded outlined :options="options" label="Choose an option" bg-color="white" emit-value map-options />
          </div>
        </div>
      </div>

      <br><br>
      <div class="column items-center" style="height: 150px;">
        <div class="login-header-forget-label red-hat-normal-font">
          <div @click="goToSignIn">If you already have an account, click here.</div>
          <br>
          <div @click="goToForgetPassword">Forgot password?</div>
        </div>
        <br>
        <div class="flex text-center">
          <q-btn class="login-header-button-sign-in red-hat-normal-font" no-caps push color="" label="Sign up"
            style="width: 100px; background-color: #4BCC53;" @click="registerUser" />
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { server_api_config } from 'src/configs/server';

const options = ref([
  { label: 'Operator', value: 'operator' },
  { label: 'Viewer', value: 'viewer' }
]);
const router = useRouter();

// Reactive form data
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const role = ref('viewer');

onMounted(async () => {
  try {
    const response = await axios.get(`http://${server_api_config.ip}:${server_api_config.port}/api/auth/admin-status`);
    if (response.data.hasAdmin === false) {
      options.value.unshift({ label: 'Administrator', value: 'admin' });
    }
  } catch (error) {
    console.error('Error fetching admin status:', error);
  }
});

// Go to sign-in page
const goToSignIn = async () => {
  try {
    await router.push('/login');
  } catch (error) {
    console.error('Navigation error:', error);
  }
};

// Go to forget password page
const goToForgetPassword = async () => {
  try {
    await router.push('/forget_password');
  } catch (error) {
    console.error('Navigation error:', error);
  }
};

// Register user and go to the verify page
const registerUser = async () => {
  if (password.value !== confirmPassword.value) {
    alert('Passwords do not match!');
    return;
  }

  try {
    // API call to register the user
    const response = await axios.post(`http://${server_api_config.ip}:${server_api_config.port}/api/auth/register`, {
      username: username.value,
      password: password.value,
      role: role.value,
    });

    // Store the token in localStorage
    const token = response.data.token;
    localStorage.setItem('username' , username.value);
    
    localStorage.setItem('authToken', token);

    console.log('User registered successfully:', response.data.message);

    // Navigate to the register verify page
    await router.push('/register_verify');
  } catch (error) {
    console.error('Registration error:', error);
    alert('Registration failed! Please try again.');
  }
};
</script>

<style scoped>
/* Selected value → black text */
:deep(.q-field--float .q-field__native) {
  color: black !important;
}

/* Placeholder / label when nothing selected → friendly blue-grey */
:deep(.q-field:not(.q-field--float) .q-field__native),
:deep(.q-field__label) {
  color: #8595A3 !important;
}
</style>
