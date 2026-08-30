import { test, expect, type Page } from '@playwright/test';
import { DUENO, CAJERO, ingresar, unico } from './helpers';

/**
 * Compra de insumo y su reflejo en caja, hecha por la pantalla real.
 *
 * Lo que agrega sobre los tests de servicio: comprueba que la persona pueda
 * completar el circuito y que los números que VE en pantalla sean los correctos
 * — que es donde se descubre que un endpoint anda pero la tabla muestra otra
 * cosa, o que el formulario manda un campo de menos.
 *
 * Desde la fase 3 la compra la hace el CENTRO: la sucursal ya no le compra a
 * proveedores, recibe traslados. El egreso de caja y su aparición en el flujo
 * no cambian — el que paga sigue siendo el cajero del local.
 */
const CENTRO = unico('Centro E2E Compra');
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

/** Pestaña "Insumo bruto" del Centro, que es donde vive la compra. */
async function irAlCentro(page: Page) {
  await page.goto('/admin/centro-produccion');
  await expect(page.getByRole('heading', { level: 1, name: /centro de producción/i }))
    .toBeVisible({ timeout: 30_000 });
  await page.locator('.sucursal-selector select').selectOption({ label: CENTRO });
  await page.getByRole('button', { name: 'Insumo bruto' }).click();
}

/** Campo de un modal del Centro: el label es hermano del input, no lo envuelve. */
function campoModal(page: Page, etiqueta: string) {
  return page.locator('.admin-modal').locator('.form-group', { hasText: etiqueta })
    .locator('input, select').first();
}

test.describe.configure({ mode: 'serial' });

test.describe('compra de insumo, inventario y caja', () => {
  test('el dueño da de alta un insumo con stock y costo en el Centro', async ({ page }) => {
    await ingresar(page, DUENO);

    await page.goto('/admin/centro-produccion');
    await page.getByRole('button', { name: /nuevo centro/i }).click();
    await campoModal(page, 'Nombre').fill(CENTRO);
    await page.locator('.admin-modal').getByRole('button', { name: /crear centro/i }).click();
    await expect(page.locator('.admin-modal')).toBeHidden({ timeout: 20_000 });
    await expect(page.locator('.sucursal-selector select option', { hasText: CENTRO }))
      .toHaveCount(1, { timeout: 20_000 });

    await irAlCentro(page);
    await page.getByRole('button', { name: /nuevo insumo/i }).first().click();
    const modal = page.locator('.admin-modal');
    await expect(modal).toBeVisible();
    await campoModal(page, 'Nombre').fill(NOMBRE_INSUMO);
    await campoModal(page, 'Stock inicial').fill(String(STOCK_INICIAL));
    await campoModal(page, 'Costo unitario').fill(String(COSTO_INICIAL));
    await modal.getByRole('button', { name: /dar de alta/i }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    const fila = page.locator('tr', { hasText: NOMBRE_INSUMO }).first();
    await expect(fila).toBeVisible({ timeout: 20_000 });
    await expect(fila).toContainText(String(STOCK_INICIAL));
  });

  test('una compra sube el stock y mueve el costo promedio ponderado', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAlCentro(page);

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

    // El turno se garantiza contra el SERVIDOR, no mirando la pantalla. Antes
    // se deducía del botón de apertura —presente y habilitado = no hay turno—,
    // y eso acertaba corriendo el spec solo pero fallaba en la suite completa,
    // donde otro test ya había cerrado el turno del seed: la pantalla decía una
    // cosa y la base otra, y el gasto moría con 409.
    //
    // Y se le mete efectivo: de una caja vacía no se paga nada, que es lo que
    // haría el cajero de verdad antes de pagarle a un proveedor.
    await page.goto('/caja');
    const preparada = await page.evaluate(async (monto) => {
      const pedir = (url: string, body: unknown) => fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const activo = await (await fetch('/api/caja/turno-activo', { credentials: 'include' })).json();
      if (!activo?.id) {
        const abre = await pedir('/api/caja/apertura', { apertura_efectivo: 0, apertura_qr: 0 });
        if (!abre.ok) return { paso: 'apertura', status: abre.status, cuerpo: await abre.text() };
      }

      const ingreso = await pedir('/api/caja/ingreso', {
        concepto: 'Fondo para el egreso del E2E', monto, metodo_pago: 'EFECTIVO',
      });
      return { paso: 'ingreso', status: ingreso.status, cuerpo: await ingreso.text() };
    }, GASTO);
    expect(preparada.status, `${preparada.paso}: ${preparada.cuerpo}`).toBe(201);

    await page.goto('/caja/gasto');
    await campo(page, 'Concepto').fill(`Compra ${NOMBRE_INSUMO}`);
    await campo(page, 'Monto').fill(String(GASTO));
    await page.locator('.form-group', { hasText: 'Categoría' }).locator('select').selectOption('Insumos');

    // Se espera la respuesta del servidor, no solo el clic: si el gasto se
    // rechaza, el test tiene que decir por qué en vez de quedarse esperando
    // una fila que nunca va a existir.
    const respuesta = page.waitForResponse(r => r.url().includes('/api/caja/gasto') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /registrar gasto/i }).click();
    const gasto = await respuesta;
    expect(gasto.status(), await gasto.text()).toBe(201);

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
