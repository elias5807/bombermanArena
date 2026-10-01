import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Laisse les erreurs Rust de Tauri visibles dans le terminal.
  clearScreen: false,
  css: {
    // Pas de PostCSS dans ce projet. Sans cette ligne, Vite en cherche la configuration en
    // remontant jusqu'à la racine du dépôt : son package.json est vide (JSON invalide), et le
    // build échoue dès que le client contient du CSS.
    postcss: {},
  },
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
