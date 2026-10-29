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
      <div v-if="isVerified">
        <div class="column text-center items-center" style="height: 70px;">
        <div v-if="qrCode" class="flex text-center">
          <img :src="qrCode" alt="QR Code" />
        </div>
      </div>
      <br>
      <br>
      <br>
      </div>
      
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
          <div>Forgot password?</div>
        </div>
        <br>

        <!-- Show the "Verify" button initially -->
        <div v-if="!isVerified">
          <q-btn class="login-header-button-sign-in red-hat-normal-font" no-caps push color="" label="Verify"
            style="width: 100px; background-color: #4BCC53;" @click="verifySecureCode" />
        </div>

        <!-- Show the "Go" button after the correct code is entered -->
        <div v-if="isVerified">
          <q-btn class="login-header-button-sign-in red-hat-normal-font" no-caps push color="" label="Go"
            style="width: 100px; background-color: #4BCC53;" @click="goToNextPage" />
        </div>
      </div>
      <br>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import QRCode from 'qrcode';
import { server_api_config } from 'src/configs/server';
import { socketService } from 'src/services/socketService';

const secureCode = ref('');
const qrCode = ref<string | null>(null);
const isVerified = ref(false);
const router = useRouter();

onMounted(async () => {
  const token = localStorage.getItem('authToken');
  const username = localStorage.getItem('username');

  if (!token || !username) {
    alert('User not found!');
    return;
  }

  try {
    const response = await axios.post(
      `http://${server_api_config.ip}:${server_api_config.port}/api/auth/secure/code`,
      { username },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (response.data && response.data.securecode) {
      const codeNum = parseInt(response.data.securecode, 10);
      if (!isNaN(codeNum)) {
        socketService.sendSecurityCode(codeNum);
        console.log(`[RegisterVerify] Sent security code ${codeNum} to reris_engine`);
      }
    }
  } catch (error) {
    console.error('[RegisterVerify] Failed to fetch security code:', error);
  }
});

// Verify by sending the code directly to the server — no local pre-check
const verifySecureCode = async () => {
  if (!secureCode.value.trim()) {
    alert('Please enter the security code.');
    return;
  }

  try {
    const username = localStorage.getItem('username');
    const response = await axios.post(
      `http://${server_api_config.ip}:${server_api_config.port}/api/auth/verify`,
      { username, securecode: secureCode.value.trim() }
    );

    if (response.data && response.data.message === 'Verification successful') {
      qrCode.value = await QRCode.toDataURL(secureCode.value.trim());
      isVerified.value = true;
      localStorage.setItem('isVerified', 'true'); // Allow router to pass
      console.log('[RegisterVerify] Verification successful.');
    } else {
      alert('Incorrect security code. Please check the code on the robot screen.');
    }
  } catch (error) {
    console.error('[RegisterVerify] Verification error:', error);
    alert('Verification failed! Please try again.');
  }
};

// Navigate to the next page after the secure code is verified
const goToNextPage = async () => {
  try {
    // Redirect to the desired page (e.g., dashboard)
    await router.push('/'); // Replace '/next_page' with the actual route
  } catch (error) {
    console.error('Navigation error:', error);
  }
};
</script>
