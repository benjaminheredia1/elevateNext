import { test, expect, type Page, type Locator } from '@playwright/test';
import { DUENO, ingresar, unico, fijarStockEnSucursal, sembrarProductoConEspejo } from './helpers';

/**
 * Caracterizacion del panel de inventario ANTES de extraerlo a un componente
 * compartido con el Centro. No prueba funcionalidad nueva: fija la que hay,
 * para que el refactor no pueda cambiarla sin que esto se ponga en rojo.
 */
const INSUMO = unico('E2E Panel');
const SUCURSAL_A = unico('E2E Panel Local A');
const SUCURSAL_B = unico('E2E Panel Local B');

const STOCK_INICIAL = 20;
const COSTO_INICIAL = 4;
const STOCK_MINIMO = 5;
const MERMA_CANTIDAD = 2;
const STOCK_TRAS_MERMA = STOCK_INICIAL - MERMA_CANTIDAD; // 18
const CONTEO_A = 15; // menor al stock tras la merma: registra una varianza negativa
const VARIANZA_CONTEO_A = CONTEO_A - STOCK_TRAS_MERMA; // -3
const CONTEO_B = 9; // valor propio de Local B, distinto del de A
const STOCK_CONSOLIDADO = CONTEO_A + CONTEO_B; // 24

// Columnas de la tabla de insumos (ver AdminInsumos.tsx): Insumo, Categoría,
// Equivalencia, Nivel, Stock, Reorden, Cobertura, Costo unit., Valor, Proveedor.
const COL_INSUMO = 0;
const COL_NIVEL = 3;
const COL_STOCK = 4;
const COL_REORDEN = 5;
const COL_COSTO = 7;

// Columnas de la tabla de movimientos: Fecha, Insumo, Tipo, Cantidad, Costo,
// Referencia, Usuario.
const COL_MOV_TIPO = 2;
const COL_MOV_CANTIDAD = 3;
const COL_MOV_REFERENCIA = 5;

function celda(fila: Locator, indice: number) {
  return fila.locator('td').nth(indice);
}

async function irAInsumos(page: Page) {
  await page.goto('/admin/insumos');
  await expect(page.getByPlaceholder(/buscar insumo/i)).toBeVisible({ timeout: 30_000 });
}

/** Campo del modal de insumos: acá el <label> SÍ envuelve al input (ver cambio-costo.spec.ts). */
function campoModal(page: Page, etiqueta: string) {
  return page.locator('.admin-modal').locator(`label:has-text("${etiqueta}") input`).first();
}

/** El motivo de la baja es un <textarea>, no un <input>. */
function textareaModal(page: Page, etiqueta: string) {
  return page.locator('.admin-modal').locator(`label:has-text("${etiqueta}") textarea`).first();
}

/** Abre el modal de una fila del inventario por el título del botón de acción. */
async function accionDeFila(page: Page, insumo: string, titulo: string) {
  const fila = page.locator('tr', { hasText: insumo }).first();
  await expect(fila).toBeVisible({ timeout: 20_000 });
  await fila.getByTitle(new RegExp(titulo, 'i')).first().click();
}

async function filaDelInsumo(page: Page) {
  await page.getByPlaceholder(/buscar insumo/i).fill(INSUMO);
  const fila = page.locator('tr', { hasText: INSUMO }).first();
  await expect(fila).toBeVisible({ timeout: 20_000 });
  return fila;
}

/** Elige una sucursal en el selector del panel (arriba, en /admin/insumos). */
async function elegirSucursal(page: Page, nombre: string) {
  const select = page.locator('.sucursal-selector select');
  await expect(select).toBeVisible({ timeout: 20_000 });
  await select.selectOption({ label: nombre });
}

/**
 * Crea una sucursal desde /admin/sucursales, con solo el nombre. El panel de
 * insumos necesita al menos dos para mostrar el selector, y estos tests
 * necesitan dos con nombres conocidos, no lo que haya dejado otra corrida.
 */
async function crearSucursal(page: Page, nombre: string) {
  await page.goto('/admin/sucursales');
  await expect(page.getByRole('heading', { level: 1, name: /sucursales/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /nueva sucursal/i }).click();
  const modal = page.locator('.admin-modal');
  await expect(modal).toBeVisible();
  await modal.locator('.form-group', { hasText: 'Nombre' }).locator('input').first().fill(nombre);
  await modal.getByRole('button', { name: /guardar/i }).click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
}

test.describe.configure({ mode: 'serial' });

test.describe('panel de inventario de sucursal', () => {
  test('alta de un insumo con stock, costo y umbrales', async ({ page }) => {
    await ingresar(page, DUENO);

    await crearSucursal(page, SUCURSAL_A);
    await crearSucursal(page, SUCURSAL_B);

    // El alta de insumo salió de la sucursal en la fase 3: su inventario son los
    // espejos de sus productos, sembrados desde el Centro. Todo lo demás que
    // prueba este archivo —merma, conteo, baja, reactivación— sigue siendo de
    // la sucursal y se ejerce igual.
    await sembrarProductoConEspejo(page, {
      nombre: INSUMO, stock: STOCK_INICIAL, costo: COSTO_INICIAL, minimo: STOCK_MINIMO,
      sucursalNombre: SUCURSAL_A,
    });

    await irAInsumos(page);
    await elegirSucursal(page, SUCURSAL_A);

    const fila = await filaDelInsumo(page);
    await expect(celda(fila, COL_STOCK)).toContainText(String(STOCK_INICIAL));
    await expect(celda(fila, COL_COSTO)).toContainText(String(COSTO_INICIAL));
    await expect(celda(fila, COL_REORDEN)).toContainText(String(STOCK_MINIMO));
  });

  test('una merma baja el stock y queda en el kardex', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);
    await elegirSucursal(page, SUCURSAL_A);
    await page.getByPlaceholder(/buscar insumo/i).fill(INSUMO);

    await accionDeFila(page, INSUMO, 'merma');
    const modal = page.locator('.admin-modal');
    await expect(modal).toBeVisible();
    await campoModal(page, 'Cantidad').fill(String(MERMA_CANTIDAD));
    await modal.getByRole('button', { name: /guardar/i }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    const fila = await filaDelInsumo(page);
    await expect(celda(fila, COL_STOCK)).toContainText(String(STOCK_TRAS_MERMA));

    // El kardex: la pestaña Movimientos tiene que traer la merma con su
    // cantidad en negativo, que es lo que la persona ve en pantalla.
    await page.getByRole('button', { name: 'Movimientos' }).click();
    const filaMov = page.locator('tr', { hasText: INSUMO }).first();
    await expect(filaMov).toBeVisible({ timeout: 20_000 });
    await expect(celda(filaMov, COL_MOV_TIPO)).toContainText('Merma');
    await expect(celda(filaMov, COL_MOV_CANTIDAD)).toContainText(`-${MERMA_CANTIDAD}`);
  });

  test('un conteo fisico ajusta al valor contado y registra la diferencia', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);
    await elegirSucursal(page, SUCURSAL_A);
    await page.getByPlaceholder(/buscar insumo/i).fill(INSUMO);

    await accionDeFila(page, INSUMO, 'corregir stock');
    const modal = page.locator('.admin-modal');
    await expect(modal).toBeVisible();
    await campoModal(page, 'Stock real').fill(String(CONTEO_A));
    await modal.getByRole('button', { name: /guardar/i }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    const fila = await filaDelInsumo(page);
    await expect(celda(fila, COL_STOCK)).toContainText(String(CONTEO_A));

    // La diferencia queda registrada como Ajuste, con la varianza en la nota.
    await page.getByRole('button', { name: 'Movimientos' }).click();
    const filaMov = page.locator('tr', { hasText: INSUMO }).first();
    await expect(filaMov).toBeVisible({ timeout: 20_000 });
    await expect(celda(filaMov, COL_MOV_TIPO)).toContainText('Ajuste');
    await expect(celda(filaMov, COL_MOV_REFERENCIA)).toContainText(`Varianza: ${VARIANZA_CONTEO_A}`);
  });

  test('el selector de sucursal cambia el stock que se ve', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);
    await elegirSucursal(page, SUCURSAL_B);

    // El insumo nace en Local A. "Agregar de otra sucursal" se fue con la fase 3
    // —copiar insumo bruto entre locales dejo de tener sentido cuando el bruto
    // vive solo en el Centro—, asi que B lo recibe con un conteo, que crea su
    // fila con un valor propio, distinto del de A.
    await fijarStockEnSucursal(page, {
      insumoNombre: INSUMO, sucursalNombre: SUCURSAL_B, stock: CONTEO_B,
    });
    await page.reload();
    await elegirSucursal(page, SUCURSAL_B);

    await page.getByPlaceholder(/buscar insumo/i).fill(INSUMO);
    const filaB = await filaDelInsumo(page);
    await expect(celda(filaB, COL_STOCK)).toContainText(String(CONTEO_B));

    await elegirSucursal(page, SUCURSAL_A);
    const filaA = await filaDelInsumo(page);
    await expect(celda(filaA, COL_STOCK)).toContainText(String(CONTEO_A));
  });

  test('sin sucursal elegida se ve el consolidado del negocio', async ({ page }) => {
    await ingresar(page, DUENO);
    // Contexto nuevo de Playwright: sin nada guardado en localStorage, el
    // panel arranca en "Todas" (consolidado) sin tocar el selector.
    await irAInsumos(page);

    const fila = await filaDelInsumo(page);
    await expect(celda(fila, COL_STOCK)).toContainText(String(STOCK_CONSOLIDADO));
    // Sumando locales el semáforo de nivel no es un dato real: el panel lo
    // dice así en vez de mostrar un estado que podría no serlo en ninguno.
    await expect(celda(fila, COL_NIVEL)).toContainText('varía por local');
  });

  test('la baja saca el insumo del local sin borrarlo del negocio', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);
    await elegirSucursal(page, SUCURSAL_A);
    await page.getByPlaceholder(/buscar insumo/i).fill(INSUMO);

    await accionDeFila(page, INSUMO, 'dar de baja');
    const modal = page.locator('.admin-modal');
    await expect(modal).toBeVisible();
    await textareaModal(page, 'Motivo de la baja').fill('Baja de prueba e2e');
    await modal.getByRole('button', { name: /guardar/i }).click();
    await expect(modal.getByText(/dado de baja correctamente/i)).toBeVisible({ timeout: 20_000 });
    await modal.getByRole('button', { name: /cerrar/i }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    // En "Activos" de Local A ya no aparece...
    await page.getByPlaceholder(/buscar insumo/i).fill(INSUMO);
    await expect(page.locator('tr', { hasText: INSUMO })).toHaveCount(0);

    // ...pero sigue existiendo: en "De Baja" del mismo local está, marcado.
    await page.locator('.cat-filter-btn', { hasText: 'De Baja' }).click();
    const filaBaja = page.locator('tr', { hasText: INSUMO }).first();
    await expect(filaBaja).toBeVisible({ timeout: 20_000 });
    await expect(celda(filaBaja, COL_INSUMO)).toContainText('INACTIVO');

    // ...y en Local B, donde nunca se dio de baja, sigue activo con su stock.
    await page.locator('.cat-filter-btn', { hasText: 'Activos' }).click();
    await elegirSucursal(page, SUCURSAL_B);
    const filaB = await filaDelInsumo(page);
    await expect(celda(filaB, COL_INSUMO)).not.toContainText('INACTIVO');
  });

  test('la reactivacion lo devuelve al inventario del local', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAInsumos(page);
    await elegirSucursal(page, SUCURSAL_A);
    await page.locator('.cat-filter-btn', { hasText: 'De Baja' }).click();
    await page.getByPlaceholder(/buscar insumo/i).fill(INSUMO);

    const filaBaja = page.locator('tr', { hasText: INSUMO }).first();
    await expect(filaBaja).toBeVisible({ timeout: 20_000 });

    // La reactivación se confirma con un window.confirm(), no con un modal.
    page.once('dialog', dialog => dialog.accept());
    await filaBaja.getByTitle(/reactivar en/i).click();

    await page.locator('.cat-filter-btn', { hasText: 'Activos' }).click();
    const filaActiva = await filaDelInsumo(page);
    await expect(celda(filaActiva, COL_INSUMO)).not.toContainText('INACTIVO');
  });
});
