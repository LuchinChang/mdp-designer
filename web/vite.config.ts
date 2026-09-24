import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves the app from /mdp-designer/.
  base: command === 'build' ? '/mdp-designer/' : '/',
  // Example models are read from ../spec/examples.
  server: { fs: { allow: ['..'] } },
}))
