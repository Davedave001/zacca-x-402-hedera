import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-only: proxies API calls to the local backend so VITE_API_BASE_URL
    // can stay empty in dev (see src/lib/config.ts). Production build talks
    // to VITE_API_BASE_URL directly (e.g. https://pay-api.zacca.ai) and
    // relies on the backend's CORS_ORIGIN instead.
    proxy: {
      '/catalog': 'http://localhost:4021',
      '/data': 'http://localhost:4021',
      '/health': 'http://localhost:4021',
    },
  },
})
