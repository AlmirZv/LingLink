import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ command: _command }) => ({
  // Absolute paths so a page opened at /onboarding/... still loads /assets from the app root.
  base: '/',
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['vue', 'vue-router', 'pinia'],
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'framework',
              test: /node_modules[\\/](vue|vue-router|pinia|vue-i18n|@vue)[\\/]/,
              priority: 20,
            },
            {
              name: 'i18n',
              test: /src[\\/]i18n[\\/]/,
              priority: 30,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/piether-dictionary': {
        target: 'https://dictionary.piether.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/piether-dictionary/, ''),
      },
    },
  },
}))
