import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webSpatial from '@webspatial/vite-plugin';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [react(), webSpatial(), cesium()],
  envDir: '..',  // .env lives in the project root (parent of firesight/)
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/assets': 'http://localhost:3001',
    },
  },
});
