<template>
    <!-- <div class="q-pa-md">
    <div class="q-gutter-md" style="max-width: 500px">
      <q-input rounded outlined v-model="text" label="Rounded outlined" />
    </div>
  </div>
   -->
    <div>
        <div class="column items-center no-select" style="height: 150px;">
            <div class="flex text-center">
                <div class="login-header-title-label no-warp red-hat-normal-font">RERIS</div>
            </div>
            <div class="flex text-center">
                <div class="login-header-subtitle-label red-hat-normal-font">Robotics Interface System</div>
            </div>
        </div>
        <div class="column" style="height: 150px">
            <div class="col red-hat-normal-font">
                <div class="login-username-label red-hat-normal-font">Username or Email</div>
                <div class="q-gutter-md" style="width: 350px;">
                    <q-input rounded outlined bg-color="white" />
                </div>
            </div>
            <br>
            <br>
            <div class="col red-hat-normal-font">
                <div class="red-hat-normal-font">Password</div>
                <div class="q-gutter-md" style="top: 10px width: 350px">
                    <q-input rounded outlined bg-color="white" />
                </div>
            </div>
        </div>
        <br>
        <div class="column items-center" style="height: 150px">
            <br>
            <div class="login-header-forget-label red-hat-normal-font">
                <div>
                    <div>If you don’t have any account. Click here.</div>

                </div>
                <br>
                <div>Forget password ?</div>
            </div>
            <br>
            <div class="flex text-center">
                <q-btn class="login-header-button-sign-in red-hat-normal-font" no-caps push color="" label="Sign in"
                    style="width: 100px; background-color: #4BCC53;"></q-btn>
            </div>
        </div>
        <!-- <div class="column" style="height: 150px">
            <div class="col">
                1 of 3
            </div>
            <div class="col">
                1 of 3
            </div>
            <div class="col">
                1 of 3
            </div>
        </div> -->

    </div>
</template>
  
<script setup lang="ts">
import '../css/login.css';
</script>
  