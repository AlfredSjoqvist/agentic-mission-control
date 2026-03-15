import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webSpatial from '@webspatial/vite-plugin';

export default defineConfig({
  plugins: [react(), webSpatial()],
  server: {
    host: true,
    port: 5173,
  },
});
