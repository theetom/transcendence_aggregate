import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    // Keep browser targets explicit; Tailwind v4 requires Firefox 128 or newer.
    // cssTarget inherits this list. Retain Vite's existing Chrome/Safari floors.
    target: ['chrome111', 'edge111', 'firefox128', 'safari16.4', 'ios16.4'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: false,
        secure: false,
      },
    },
  },
})
