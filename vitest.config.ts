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
    // Los .spec.ts de e2e/ son de Playwright (navegador real, servidor
    // levantado); Vitest los tomaría por su nombre y fallarían al importar
    // @playwright/test fuera de su runner.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'e2e/**'],
  },
});
