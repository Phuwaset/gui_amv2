// stores/userStore.ts
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('userAuthenticate', {
  state: () => {
    return { count: 0 }
  },
  // could also be defined as
  // state: () => ({ count: 0 })
  actions: {
    increment() {
      this.count++
    },
  },
})