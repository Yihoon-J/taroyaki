// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  ssr: false,
  modules: ['@pinia/nuxt'],
  runtimeConfig: {
    public: {
      api: 'https://pasufpa7t7.execute-api.us-east-1.amazonaws.com', // TODO: replace with actual api gateway url
    },
  },
  imports: {
    dirs: ['stores'],
  },
  pinia: {
    storesDirs: ['./stores/**'],
  },
});
