import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // NLDD ships Lit-based web components. Without this Vue treats every
          // <nldd-*> tag as an unresolved Vue component and logs a warning for
          // each one; with it, they compile straight to DOM elements.
          isCustomElement: (tag) => tag.startsWith('nldd-'),
        },
      },
    }),
  ],
  server: {
    proxy: {
      // ws: true so the collab WebSocket (/api/collab/:id) upgrade is proxied
      // to the backend alongside normal /api HTTP requests.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
