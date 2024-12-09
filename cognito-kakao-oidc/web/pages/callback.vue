<template>
  <div>Redirecting...</div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const authStore = useAuthStore()

function decodeJWT(token: string) {
  const base64Url = token.split('.')[1]
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
  }).join(''))

  return JSON.parse(jsonPayload)
}

onMounted(() => {
  if (route.hash) {
    const params = new URLSearchParams(route.hash.slice(1))
    const idToken = params.get('id_token')
    if (idToken) {
      authStore.setAccessToken(idToken)
      
      // Decode the JWT to get the email, nickname, and sub (user ID)
      const decodedToken = decodeJWT(idToken)
      console.log('Decoded token:', decodedToken) // 디버깅을 위한 로그 추가
      
      const userEmail = decodedToken.email
      const userNickname = decodedToken.nickname || decodedToken.name || 'User'
      const userId = decodedToken.sub // 'sub' 값 추출

      if (userEmail && userId) {
        // Redirect to tarot.html on port 3001 with the token, email, nickname, and sub
        const redirectUrl = `http://localhost:3001/tarot.html#id_token=${idToken}&user_email=${encodeURIComponent(userEmail)}&user_nickname=${encodeURIComponent(userNickname)}&sub=${encodeURIComponent(userId)}`
        console.log('Redirecting to:', redirectUrl) // 디버깅을 위한 로그 추가
        window.location.href = redirectUrl
      } else {
        console.error('No email or sub found in the id_token', { email: userEmail, sub: userId })
        // Handle error - maybe redirect to login page
      }
    } else {
      console.error('No id_token found in the callback URL')
      // Handle error - maybe redirect to login page
    }
  } else {
    console.error('No hash found in the callback URL')
    // Handle error - maybe redirect to login page
  }
})
</script>