import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    // The FastAPI backend runs on 8001 in development.
    proxy: { '/api': 'http://127.0.0.1:8001' },
  },
  test: { environment: 'jsdom' },
})
