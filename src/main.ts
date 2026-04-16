import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import './assets/main.css'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App).use(pinia).mount('#app')
