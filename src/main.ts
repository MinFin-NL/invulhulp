import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import './assets/main.css'

// When the BFF session expires, any /api call returns 401. Bounce the whole
// page to the SSO login (skip /api/auth/* so the gate handles those itself).
// Disabled under the dev auth bypass — there is no login to bounce to.
const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true'
const nativeFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const res = await nativeFetch(input, init)
  const url =
    typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
  if (!AUTH_BYPASS && res.status === 401 && url.includes('/api/') && !url.includes('/api/auth/')) {
    window.location.href = '/api/auth/login'
  }
  return res
}

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App).use(pinia).mount('#app')
