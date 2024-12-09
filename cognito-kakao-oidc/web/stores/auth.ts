import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string>('')

  function setAccessToken(token: string) {
    accessToken.value = token
  }

  function clearAccessToken() {
    accessToken.value = ''
  }

  return {
    accessToken,
    setAccessToken,
    clearAccessToken
  }
})