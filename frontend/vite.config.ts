import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/requests': 'http://127.0.0.1:8000',
      '/dispatches': 'http://127.0.0.1:8000',
      '/audit': 'http://127.0.0.1:8000',
      '/readiness': 'http://127.0.0.1:8000',
    },
  },
})
