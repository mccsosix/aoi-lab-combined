import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // GitHub Pages 子路径部署，否则构建产物的资源路径会 404
  base: '/aoi-lab-combined/',
  plugins: [react(), tailwindcss()],
});
