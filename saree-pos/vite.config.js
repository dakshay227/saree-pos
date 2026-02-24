import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/saree-pos/', // <-- ADD THIS LINE (use your exact GitHub repo name)
})