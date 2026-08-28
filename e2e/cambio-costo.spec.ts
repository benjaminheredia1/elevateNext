import { test, expect, type Page } from '@playwright/test';
import { DUENO, ingresar, unico } from './helpers';

/**
 * Cambiar el costo de un insumo desde la pantalla.
 *
 * Reproduce el reporte de producción: *"cambio Agua Cielo de 3.8 a 4 y me sigue
 * saliendo 3.8"*. El bug no estaba en el cálculo sino en el camino — el
 * formulario guardaba el costo del catálogo y las recetas leen el de la
 * sucursal — y por eso solo un test que pase por el formulario lo hubiera
 * atrapado.
 */
const INSUMO = unico('E2E Costo');
const COSTO_INICIAL = 4;
const COSTO_NUEVO = 9;

function campoModal(page: Page, etiqueta: string) {
  // En el modal de insumos el <label> SÍ envuelve al input, al revés que en las
  // pantallas de caja.
  return page.locator('.admin-modal').locator(`label:has-text("${etiqueta}") input`).first();
}

async function irAInsumos(page: Page) {
  await page.goto('/admin/insumos');
  await expect(page.getByPlaceholder(/buscar insumo/i)).toBeVisible({ timeout: 30_000 });
}

async function filaDelInsumo(page: Page) {
  await page.getByPlaceholder(/buscar insumo/i).fill(INSUMO);
  const fila = page.locator('tr', { hasText: INSUMO }).first();
  await expect(fila).toBeVisible({ timeout: 20_000 });
  return fila;
}

test.describe.configure({ mode: 'serial' });

test.describe('cambio del costo de un insumo', () => {
  test('se crea el insumo con su costo inicial', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);

    await page.getByRole('button', { name: '+ Insumo' }).first().click();
    await expect(page.locator('.admin-modal')).toBeVisible();
    await campoModal(page, 'Nombre').fill(INSUMO);
    await campoModal(page, 'Stock').fill('50');
    await campoModal(page, 'Costo unitario').fill(String(COSTO_INICIAL));
    await campoModal(page, 'Stock mínimo').fill('1');
    await page.locator('.admin-modal').getByRole('button', { name: /guardar|crear|confirmar/i }).click();
    await expect(page.locator('.admin-modal')).toBeHidden({ timeout: 20_000 });

    const fila = await filaDelInsumo(page);
    await expect(fila).toContainText(String(COSTO_INICIAL));
  });

  test('editar el costo lo cambia en la pantalla, no vuelve al viejo', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);
    const fila = await filaDelInsumo(page);

    await fila.getByTitle(/editar insumo/i).first().click();
    await expect(page.locator('.admin-modal')).toBeVisible();

    const costo = campoModal(page, 'Costo unitario');
    await expect(costo).toHaveValue(new RegExp(`^${COSTO_INICIAL}`));
    await costo.fill(String(COSTO_NUEVO));
    await page.locator('.admin-modal').getByRole('button', { name: /guardar|actualizar|confirmar/i }).click();
    await expect(page.locator('.admin-modal')).toBeHidden({ timeout: 20_000 });

    // Recarga completa: si el costo nuevo solo viviera en el estado de React,
    // acá volvería a aparecer el viejo. Es exactamente el síntoma reportado.
    await page.reload();
    const filaDespues = await filaDelInsumo(page);
    await expect(filaDespues).toContainText(String(COSTO_NUEVO));
  });

  test('reabrir el formulario muestra el costo nuevo, no el del catálogo', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);
    const fila = await filaDelInsumo(page);

    await fila.getByTitle(/editar insumo/i).first().click();
    await expect(page.locator('.admin-modal')).toBeVisible();
    await expect(campoModal(page, 'Costo unitario')).toHaveValue(new RegExp(`^${COSTO_NUEVO}`));
  });

  test('editar el costo no cambia la cantidad en stock', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);
    const fila = await filaDelInsumo(page);

    // Los 50 del alta siguen ahí: cambiar un precio no hace aparecer ni
    // desaparecer mercadería.
    await expect(fila).toContainText('50');
  });
});
