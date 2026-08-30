import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const rawBasePath = environment.VITE_BASE_PATH || '/'
  const base = `/${rawBasePath.replace(/^\/+|\/+$/g, '')}${rawBasePath === '/' ? '' : '/'}`

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api/web/v1': {
          target: environment.VITE_HELPER_DEV_URL || 'http://127.0.0.1:3001',
          changeOrigin: false,
        },
      },
    },
  }
})
