import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
  ],
  // No `base` needed for Cloudflare Pages — it serves from the root
  // If you use GitHub Pages instead, add: base: '/worldcup-lms/'
})