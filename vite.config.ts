import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)('./package.json') as { version: string };

// La interfaz se sirve como aplicación estática dentro de Electron: base relativa.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  define: {
    // La interfaz necesita la versión para el paquete de exportación; en el PC
    // se la da Electron, en el móvil no hay a quién preguntársela.
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5273,
    strictPort: true,
  },
});
