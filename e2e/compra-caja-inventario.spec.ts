import { test, expect, type Page } from '@playwright/test';
import { DUENO, CAJERO, ingresar, unico } from './helpers';

/**
 * Compra de insumo y su reflejo en caja, hecha por la pantalla real.
 *
 * Lo que agrega sobre los tests de servicio: comprueba que la persona pueda
 * completar el circuito y que los números que VE en pantalla sean los correctos
 * — que es donde se descubre que un endpoint anda pero la tabla muestra otra
 * cosa, o que el formulario manda un campo de menos.
 */
const NOMBRE_INSUMO = unico('E2E Aceite');
const STOCK_INICIAL = 10;
const COSTO_INICIAL = 8;
const COMPRA_CANTIDAD = 10;
const COMPRA_COSTO = 12;
const GASTO = COMPRA_CANTIDAD * COMPRA_COSTO; // Bs 120

/**
 * Campo de formulario por su etiqueta. En las pantallas de caja el <label> es
 * hermano del input dentro de .form-group, no lo envuelve: por eso no sirve el
 * getByLabel de Playwright ni un `label:has-text(...) input`.
 */
function campo(page: Page, etiqueta: string) {
  return page.locator('.form-group', { hasText: etiqueta }).locator('input').first();
}

/** Abre el modal de una fila del inventario por el título del botón. */
async function accionDeFila(page: Page, insumo: string, titulo: string) {
  const fila = page.locator('tr', { hasText: insumo }).first();
  await expect(fila).toBeVisible({ timeout: 20_000 });
  await fila.getByTitle(new RegExp(titulo, 'i')).first().click();
}

async function irAInsumos(page: Page) {
  await page.goto('/admin/insumos');
  await expect(page.getByPlaceholder(/buscar insumo/i)).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('compra de insumo, inventario y caja', () => {
  test('el dueño da de alta un insumo con stock y costo', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);

    await page.getByRole('button', { name: '+ Insumo' }).first().click();
    const modal = page.locator('.admin-modal');
    await expect(modal).toBeVisible();

    await modal.locator('label:has-text("Nombre") input').fill(NOMBRE_INSUMO);
    await modal.locator('label:has-text("Stock") input').first().fill(String(STOCK_INICIAL));
    await modal.locator('label:has-text("Costo unitario") input').fill(String(COSTO_INICIAL));
    await modal.locator('label:has-text("Stock mínimo") input').fill('2');
    await modal.getByRole('button', { name: /guardar|crear|confirmar/i }).click();

    await expect(modal).toBeHidden({ timeout: 20_000 });

    await page.getByPlaceholder(/buscar insumo/i).fill(NOMBRE_INSUMO);
    const fila = page.locator('tr', { hasText: NOMBRE_INSUMO }).first();
    await expect(fila).toBeVisible({ timeout: 20_000 });
    await expect(fila).toContainText(String(STOCK_INICIAL));
  });

  test('una compra sube el stock y mueve el costo promedio ponderado', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);
    await page.getByPlaceholder(/buscar insumo/i).fill(NOMBRE_INSUMO);

    await accionDeFila(page, NOMBRE_INSUMO, 'compra');
    const modal = page.locator('.admin-modal');
    await expect(modal).toBeVisible();

    await modal.locator('input[type="number"]').first().fill(String(COMPRA_CANTIDAD));
    await modal.locator('label:has-text("Costo") input').first().fill(String(COMPRA_COSTO));
    await modal.getByRole('button', { name: /guardar|registrar|confirmar/i }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    const fila = page.locator('tr', { hasText: NOMBRE_INSUMO }).first();
    await expect(fila).toBeVisible();

    // 10 @ 8 + 10 @ 12 → 20 unidades a Bs 10 de promedio. Que la pantalla
    // muestre 20 es lo que prueba que la compra llegó completa.
    await expect(fila).toContainText('20', { timeout: 20_000 });
    const texto = await fila.innerText();
    expect(texto).toMatch(/\b10([.,]\d+)?\b/);
  });

  test('el cajero registra el egreso y la caja baja por ese monto', async ({ page }) => {
    await ingresar(page, CAJERO);

    // Sin turno abierto la caja no acepta movimientos, así que se abre uno.
    // La página de apertura deshabilita el botón si ya hay turno, lo que la
    // hace segura de visitar aunque otro test lo haya dejado abierto.
    await page.goto('/caja/apertura');
    const botonAbrir = page.getByRole('button', { name: /^abrir caja$/i });
    if (await botonAbrir.isEnabled()) {
      await campo(page, 'Efectivo inicial').fill('500');
      await campo(page, 'QR inicial').fill('0');
      await botonAbrir.click();
      await expect(page.locator('body')).toContainText(/turno|caja/i, { timeout: 30_000 });
    }

    await page.goto('/caja/gasto');
    await campo(page, 'Concepto').fill(`Compra ${NOMBRE_INSUMO}`);
    await campo(page, 'Monto').fill(String(GASTO));
    await page.locator('.form-group', { hasText: 'Categoría' }).locator('select').selectOption('Insumos');
    await page.getByRole('button', { name: /registrar gasto/i }).click();

    // El libro del turno tiene que mostrarlo como salida.
    await page.goto('/caja/movimientos');
    const fila = page.locator('tr', { hasText: `Compra ${NOMBRE_INSUMO}` }).first();
    await expect(fila).toBeVisible({ timeout: 30_000 });
    // Se busca el monto como texto y no parseando la fila entera: la fila trae
    // hora, método y saldo, y cualquiera de esos números pasaría un parseo laxo.
    await expect(fila).toContainText(String(GASTO));
  });

  test('el gasto aparece en el flujo de caja del dueño, del lado de las salidas', async ({ page }) => {
    await ingresar(page, DUENO);
    await page.goto('/admin/flujo-caja');

    const fila = page.locator('tr', { hasText: `Compra ${NOMBRE_INSUMO}` }).first();
    await expect(fila).toBeVisible({ timeout: 30_000 });

    // La pantalla no usa el signo para marcar la salida: la fila se identifica
    // por su tipo (GASTO_OPERATIVO) y muestra el monto en positivo. Se asevera
    // lo que el usuario realmente ve, no lo que uno supondría.
    await expect(fila).toContainText('GASTO_OPERATIVO');
    await expect(fila).toContainText('120');
  });
});
