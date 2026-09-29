import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Laisse les erreurs Rust de Tauri visibles dans le terminal.
  clearScreen: false,
  server: {
    // Port fixe : Tauri charge cette URL exacte (voir src-tauri/tauri.conf.json).
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
