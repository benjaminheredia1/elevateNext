import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de navegador.
 *
 * Corre contra la BD de TESTS (`.env.test`, puerto 5434), nunca contra el
 * sandbox ni contra producción: estos tests crean insumos, venden y cierran
 * turnos, y esa base es desechable y se resiembra con `npm run pretest`.
 *
 * El servidor lo levanta Playwright con `npm run dev:e2e`, que arranca Next con
 * las variables de `.env.test` por delante. Como dotenv-cli las escribe en
 * process.env antes de que Next cargue sus archivos, la DATABASE_URL de `.env`
 * —que apunta a PRODUCCIÓN— no puede pisarlas.
 *
 * `dev:e2e` COMPILA antes de servir. `next start` sirve el último build, no el
 * código fuente: sin el build por delante, editar un componente y correr los
 * E2E probaba la versión anterior y pasaba en verde sin tocar el cambio. Pasó
 * el 2026-08-28 y costó media fase de verificaciones que no verificaban nada.
 *
 * Puerto 3100 y no 3000 para poder correr los e2e con el sandbox levantado al
 * mismo tiempo.
 */
const PUERTO = 3100;

export default defineConfig({
  testDir: './e2e',
  // Los tests comparten una sola base y recursos únicos (el turno de caja
  // abierto de una sucursal), igual que la suite de Vitest.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-BO',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev:e2e',
    url: `http://127.0.0.1:${PUERTO}/login`,
    reuseExistingServer: !process.env.CI,
    // Generoso porque `dev:e2e` COMPILA antes de servir, y el build completo
    // ronda el minuto y medio. Con el timeout viejo (180 s) la suite empezó a
    // caerse por el arranque y no por los tests.
    timeout: 600_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
