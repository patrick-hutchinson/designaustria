import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Unit tests for the WordPress migration helpers. Pure functions, no database.
// Run from designaustria-app/: npm run test:migration
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['migration/wordpress/**/*.spec.ts'],
  },
})
