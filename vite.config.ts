import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Set base to '/' for local dev and GitHub Pages root deploy.
// For a project-page deploy (github.com/org/repo), set base to '/repo-name/'.
// Override with VITE_BASE env var: VITE_BASE=/mmc-dashboard/ npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  // Data files live at data/ in the repo root.
  // Vite's publicDir copies files from the named directory into dist/ at the root.
  // Setting publicDir: 'data' would serve data files at /data/*.json in dev and dist.
  // Use a copy plugin or symlink if you need data/ under publicDir during Vite dev.
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
