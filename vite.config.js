import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // ១. បន្ថែមបន្ទាត់នេះ

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), //  ២. បន្ថែមបន្ទាត់នេះ
  ],
})