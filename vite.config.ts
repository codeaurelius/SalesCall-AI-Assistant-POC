import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: 'src/sidepanel',
  base: './',
  build: {
    outDir: '../../dist/sidepanel',
    emptyOutDir: true
  }
});
