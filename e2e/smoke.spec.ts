import { test, expect } from '@playwright/test';
import { DUENO, CAJERO, ingresar } from './helpers';

/**
 * Smoke: que el login funcione y que cada rol aterrice donde le corresponde.
 *
 * Si esto falla, los demás e2e no significan nada — por eso va primero y
 * verifica también lo más barato de romper sin darse cuenta: que un cajero no
 * pueda entrar al panel de administración por URL directa.
 */
test.describe('acceso', () => {
  test('el dueño entra y ve el panel de administración', async ({ page }) => {
    await ingresar(page, DUENO);
    await page.goto('/admin/centro-produccion');
    await expect(page.getByRole('heading', { name: /centro de producción/i })).toBeVisible();
  });

  test('el cajero entra a su caja', async ({ page }) => {
    await ingresar(page, CAJERO);
    await page.goto('/caja');
    await expect(page).toHaveURL(/\/caja/);
  });

  test('un cajero no entra al panel de administración escribiendo la URL', async ({ page }) => {
    await ingresar(page, CAJERO);
    await page.goto('/admin/centro-produccion');
    // Puede rebotar o mostrar un aviso; lo que no puede es dejarlo operar.
    await expect(page.getByRole('button', { name: /nuevo insumo|nuevo centro/i })).toHaveCount(0);
  });

  test('sin sesión, /admin manda al login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin/centro-produccion');
    await expect(page).toHaveURL(/\/login/);
  });
});
