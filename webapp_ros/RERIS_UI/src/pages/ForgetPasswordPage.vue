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
          <div class="red-hat-normal-font">New Password</div>
          <div class="q-gutter-md" style="width: 350px;">
            <q-input v-model="newPassword" type="password" rounded outlined bg-color="white" />
          </div>
        </div>
      </div>

      <br><br>
      <div class="column" style="height: 50px;">
        <div class="col red-hat-normal-font">
          <div class="login-username-label red-hat-normal-font">Confirm New Password</div>
          <div class="q-gutter-md" style="width: 350px;">
            <q-input v-model="confirmPassword" type="password" rounded outlined bg-color="white" />
          </div>
        </div>
        <br><br>
      </div>

      <br><br>
      <div class="column" style="height: 70px;">
        <div class="col red-hat-normal-font">
          <div class="red-hat-normal-font">Security Code</div>
          <div class="q-gutter-md" style="width: 350px;">
            <q-input v-model="secureCode" rounded outlined bg-color="white" />
          </div>
        </div>
      </div>

      <br>
      <div class="column items-center" style="height: 150px;">
        <div class="login-header-forget-label red-hat-normal-font">
          <div>We need your security code to verify your identification!</div>
        </div>
        <br>
        <div v-if="message" class="text-center" :class="{'text-positive': isSuccess, 'text-negative': !isSuccess}">
          {{ message }}
        </div>
        <br>
        <div class="flex text-center">
          <q-btn class="login-header-button-sign-in red-hat-normal-font" no-caps push color="" label="Reset Password"
            style="width: 140px; background-color: #4BCC53;" @click="resetPassword" />
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import '../css/login.css';
import { server_api_config } from 'src/configs/server';
const router = useRouter();

// Reactive variables to bind form inputs
const username = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const secureCode = ref('');
const message = ref('');
const isSuccess = ref(true);

// Function to reset the password
const resetPassword = async () => {
  // Check if the password and confirm password match
  if (newPassword.value !== confirmPassword.value) {
    message.value = "Passwords do not match!";
    isSuccess.value = false;
    return;
  }

  // Prepare the body for the API request
  const payload = {
    username: username.value,
    newpassword: newPassword.value,
    securecode: secureCode.value
  };

  try {
    // Make the API call to reset the password
    const response = await axios.post(`http://${server_api_config.ip}:${server_api_config.port}/api/auth/forget`, payload);

    // Check the API response
    if (response.data.success === 'true') {
      message.value = response.data.message;
      isSuccess.value = true;
      void router.push('/');
    } else {
      message.value = response.data.message || 'Password reset failed.';
      isSuccess.value = false;
    }
  } catch (error) {
    console.error('Error resetting password:', error);
    message.value = 'An error occurred. Please try again.';
    isSuccess.value = false;
  }
};
</script>
