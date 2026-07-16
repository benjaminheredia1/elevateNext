import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // Los tests de integración comparten una sola BD local y recursos únicos
    // (p. ej. el turno de caja abierto por sucursal): correr archivos en
    // paralelo produce carreras. Secuencial = determinista.
    fileParallelism: false,
  },
});
