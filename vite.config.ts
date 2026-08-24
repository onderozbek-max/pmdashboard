import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Set base to '/' for local dev and GitHub Pages root deploy.
// For a project-page deploy (github.com/org/repo), set base to '/repo-name/'.
// Override with VITE_BASE env var: VITE_BASE=/mmc-dashboard/ npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
