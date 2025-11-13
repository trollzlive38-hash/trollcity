import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Use package resolution for Supabase; avoid hardcoded ESM file path
    },
    // Prevent multiple copies of React or React Query from being bundled
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json']
  },
  ssr: {
    noExternal: ['@supabase/supabase-js']
  },
  optimizeDeps: {
    include: ['@supabase/supabase-js'],
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
}) 
