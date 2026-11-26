import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

const resolvedViteConfig = viteConfig({ command: 'serve', mode: 'test' })

export default mergeConfig(
  resolvedViteConfig,
  defineConfig({
    test: {
      environment: 'node',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
