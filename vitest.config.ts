import { defineConfig, configDefaults } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // Los worktrees de `.claude/` son copias completas del repo: sin esto la
    // suite entera corre dos veces contra la misma BD de test y los datos
    // duplicados hacen fallar los asserts de montos acumulados.
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
    // Los tests de integración comparten una sola BD local y recursos únicos
    // (p. ej. el turno de caja abierto por sucursal): correr archivos en
    // paralelo produce carreras. Secuencial = determinista.
    fileParallelism: false,
  },
});
