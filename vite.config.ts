import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// https://vite.dev/config/
export default defineConfig({
  // @ts-expect-error vite-plugin-cesium ships CJS-flavoured types that nodenext reads as a namespace
  plugins: [react(), cesium()],
  optimizeDeps: {
    // maplibre-gl spawns its own worker from a sibling module; the dep optimizer breaks that URL.
    exclude: ['maplibre-gl'],
  },
});
