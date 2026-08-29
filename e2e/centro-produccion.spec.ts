import { test, expect, type Page } from '@playwright/test';
import { DUENO, CAJERO, ingresar, unico } from './helpers';

/**
 * El circuito completo del Centro por la pantalla: insumo bruto → receta →
 * producción → envío → recepción en el local.
 *
 * El escenario se arma solo (centro y producto propios, con nombres únicos) en
 * vez de apoyarse en lo que haya en la base: la BD de tests acumula datos de
 * otras corridas, y un test que elige "el primero de la lista" pasa o falla
 * según quién corrió antes.
 */
const CENTRO = unico('Centro E2E');
const INSUMO_BRUTO = unico('E2E Harina');
const PRODUCTO = unico('E2E Empanada');
const STOCK_BRUTO = 100;      // kg
const COSTO_BRUTO = 6;        // Bs/kg
const POR_UNIDAD = 0.25;      // kg por unidad → Bs 1,50 de costo
const A_PRODUCIR = 40;
const A_ENVIAR = 10;

/**
 * Campo del modal por su etiqueta. Se ancla en `.form-group` porque cubre las
 * dos formas que conviven en el proyecto: el <label class="form-group"> que
 * envuelve al input (AdminInsumos) y el <div class="form-group"> con el label
 * como hermano (Centro y caja).
 */
function campoModal(page: Page, etiqueta: string) {
  return page.locator('.admin-modal').locator('.form-group', { hasText: etiqueta })
    .locator('input, select').first();
}

const modal = (page: Page) => page.locator('.admin-modal');

async function irAlCentro(page: Page, pestana: 'Insumo bruto' | 'Productos' | 'Movimientos' | 'Producción' | 'Envíos a sucursal') {
  await page.goto('/admin/centro-produccion');
  // level: 1 para no chocar con el <h2> de un modal, que dice casi lo mismo.
  await expect(page.getByRole('heading', { level: 1, name: /centro de producción/i })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sucursal-selector select').selectOption({ label: CENTRO });
  await page.getByRole('button', { name: pestana }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('centro de producción de punta a punta', () => {
  test('se crea el centro y se le carga insumo bruto', async ({ page }) => {
    await ingresar(page, DUENO);
    await page.goto('/admin/centro-produccion');
    await expect(page.getByRole('heading', { level: 1, name: /centro de producción/i })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /nuevo centro/i }).click();
    await campoModal(page, 'Nombre').fill(CENTRO);
    await modal(page).getByRole('button', { name: /crear centro/i }).click();
    await expect(modal(page)).toBeHidden({ timeout: 20_000 });

    // El selector se repuebla cuando React Query revalida la lista: sin esperar
    // a que la opción exista, el selectOption corre contra el listado viejo.
    await expect(page.locator('.sucursal-selector select option', { hasText: CENTRO }))
      .toHaveCount(1, { timeout: 20_000 });
    await page.locator('.sucursal-selector select').selectOption({ label: CENTRO });

    await page.getByRole('button', { name: /nuevo insumo/i }).click();
    await campoModal(page, 'Nombre').fill(INSUMO_BRUTO);
    await campoModal(page, 'Stock inicial').fill(String(STOCK_BRUTO));
    await campoModal(page, 'Costo unitario').fill(String(COSTO_BRUTO));
    await modal(page).getByRole('button', { name: /dar de alta/i }).click();
    await expect(modal(page)).toBeHidden({ timeout: 20_000 });

    const fila = page.locator('tr', { hasText: INSUMO_BRUTO }).first();
    await expect(fila).toBeVisible({ timeout: 20_000 });
    await expect(fila).toContainText(String(STOCK_BRUTO));
    // Valorizado: 100 × 6 = Bs 600.
    await expect(fila).toContainText('600');
  });

  test('se define la receta y la pantalla calcula rinde y costo por unidad', async ({ page }) => {
    await ingresar(page, DUENO);

    // El producto se crea por API: el wizard de catálogo es un flujo aparte con
    // sus propios tests, y acá lo que se prueba es la producción. Se crea como
    // TERCIADO, que es lo que el negocio va a usar de ahora en más.
    // Se usa fetch DENTRO de la página y no page.request: la sesión viaja en
    // una cookie httpOnly que el contexto de request no siempre arrastra, y un
    // 401 acá se leería como "el alta falló" cuando en realidad faltó la sesión.
    await page.goto('/admin/centro-produccion');
    const alta = await page.evaluate(async (nombre) => {
      // Desde la fase 3 el alta exige el centro que lo produce: sin centro_id
      // el servidor responde 422.
      const centros = await (await fetch('/api/admin/centros-produccion', { credentials: 'include' })).json();
      const centroId = centros?.items?.[0]?.id;

      const res = await fetch('/api/admin/productos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nombre, descripcion: 'Producto de prueba e2e', precio: 12,
          tipo: 'TERCIADO', estado_publicacion: 'BORRADOR',
          categorias: [], marcas: [], receta: [],
          centro_id: centroId,
        }),
      });
      return { ok: res.ok, status: res.status, cuerpo: await res.text() };
    }, PRODUCTO);
    expect(alta.ok, `alta del producto: ${alta.status} ${alta.cuerpo}`).toBeTruthy();

    await irAlCentro(page, 'Producción');
    await page.getByRole('button', { name: /nueva receta/i }).click();
    await expect(modal(page)).toBeVisible();

    // Se busca la opción por texto contenido en vez de por label exacto: los
    // <option> del formulario agregan datos al nombre (stock, unidad) y un
    // match exacto se rompe con cualquier cambio de copy.
    const selectProducto = modal(page).locator('select').first();
    await expect(selectProducto.locator('option')).not.toHaveCount(1, { timeout: 30_000 });
    const productos = await selectProducto.locator('option').allInnerTexts();
    const idxProducto = productos.findIndex(o => o.includes(PRODUCTO));
    expect(idxProducto, `el producto ${PRODUCTO} no aparece en el selector`).toBeGreaterThan(0);
    await selectProducto.selectOption({ index: idxProducto });

    const selectInsumo = modal(page).locator('select').nth(1);
    const opciones = await selectInsumo.locator('option').allInnerTexts();
    const idx = opciones.findIndex(o => o.includes(INSUMO_BRUTO));
    expect(idx).toBeGreaterThan(0);
    await selectInsumo.selectOption({ index: idx });

    await modal(page).locator('input[type="number"]').first().fill(String(POR_UNIDAD));
    await modal(page).getByRole('button', { name: /guardar receta/i }).click();
    await expect(modal(page)).toBeHidden({ timeout: 20_000 });

    const fila = page.locator('tr', { hasText: PRODUCTO }).first();
    await expect(fila).toBeVisible({ timeout: 20_000 });
    // 100 kg / 0,25 = 400 unidades posibles, a 0,25 × 6 = Bs 1,50 cada una.
    await expect(fila).toContainText('400');
    await expect(fila).toContainText('1,50');
  });

  test('producir consume el bruto y acredita el terminado', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAlCentro(page, 'Producción');

    const filaProducto = page.locator('tr', { hasText: PRODUCTO }).first();
    await filaProducto.getByRole('button', { name: /producir/i }).click();
    await expect(modal(page)).toBeVisible();
    await modal(page).locator('input[type="number"]').first().fill(String(A_PRODUCIR));
    await modal(page).getByRole('button', { name: /^producir$/i }).click();
    await expect(modal(page)).toBeHidden({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Insumo bruto' }).click();

    // El bruto bajó: 100 − 40 × 0,25 = 90…
    const filaBruto = page.locator('tr', { hasText: INSUMO_BRUTO }).first();
    await expect(filaBruto).toContainText('90', { timeout: 20_000 });

    // …y el terminado aparece en Productos, que es la otra mitad del inventario
    // del Centro: la misma tabla, separada porque el bruto y el terminado no se
    // operan igual.
    await page.getByRole('button', { name: 'Productos' }).click();
    const filaTerminado = page.locator('tr', { hasText: PRODUCTO }).first();
    await expect(filaTerminado).toContainText(String(A_PRODUCIR), { timeout: 20_000 });

    // Y no se cuela en la pestaña del bruto, ni el bruto en la suya.
    await page.getByRole('button', { name: 'Insumo bruto' }).click();
    await expect(page.locator('tr', { hasText: PRODUCTO })).toHaveCount(0);
  });

  test('el envío deja el valor en tránsito y el cajero lo recibe', async ({ page }) => {
    await ingresar(page, DUENO);
    await irAlCentro(page, 'Envíos a sucursal');

    await page.getByRole('button', { name: /nuevo envío/i }).click();
    await expect(modal(page)).toBeVisible();

    await modal(page).locator('select').first().selectOption({ index: 1 });   // sucursal destino
    const insumos = modal(page).locator('select').nth(1);
    // Las opciones llegan por React Query: leerlas antes de que la respuesta
    // vuelva daba una lista con solo "Elegí…" y el test fallaba diciendo que el
    // producto no estaba, cuando en realidad todavía no había cargado.
    await expect(insumos.locator('option', { hasText: PRODUCTO })).toHaveCount(1, { timeout: 20_000 });
    const opciones = await insumos.locator('option').allInnerTexts();
    const idx = opciones.findIndex(o => o.includes(PRODUCTO));
    expect(idx).toBeGreaterThan(0);
    await insumos.selectOption({ index: idx });

    await modal(page).locator('input[type="number"]').first().fill(String(A_ENVIAR));
    await modal(page).getByRole('button', { name: /despachar/i }).click();
    await expect(modal(page)).toBeHidden({ timeout: 20_000 });

    // Mientras viaja no está en ningún inventario, así que el KPI tiene que
    // mostrar esa plata: 10 × 1,50 = Bs 15.
    await expect(page.locator('.kpi-grid')).toContainText('15');
    await expect(page.locator('tr', { hasText: /en tránsito/i }).first()).toBeVisible({ timeout: 20_000 });

    // Y el local lo recibe.
    await ingresar(page, CAJERO);
    await page.goto('/caja/recepciones');
    const porRecibir = page.locator('tr', { hasText: PRODUCTO }).first();
    await expect(porRecibir).toBeVisible({ timeout: 30_000 });
    await porRecibir.getByRole('button', { name: /recibir/i }).click();

    await expect(modal(page)).toBeVisible();
    await modal(page).getByRole('button', { name: /confirmar recepción/i }).click();
    await expect(modal(page)).toBeHidden({ timeout: 20_000 });

    await expect(page.locator('tr', { hasText: PRODUCTO }).first()).toContainText(/recibido/i, { timeout: 20_000 });

    // Y en el catalogo del LOCAL: el producto tiene sus unidades para vender y
    // no reclama ficha tecnica. Desde el corte la sucursal no arma nada, vende
    // 1:1 contra el espejo que le llego, asi que exigirle receta local era
    // pedirle algo que ya no le corresponde.
    await ingresar(page, DUENO);
    await page.goto('/admin/products');
    await page.getByPlaceholder(/buscar producto/i).fill(PRODUCTO);
    const fila = page.locator('tr', { hasText: PRODUCTO }).first();
    await expect(fila).toBeVisible({ timeout: 30_000 });
    await expect(fila).not.toContainText(/sin ficha/i);
    await expect(fila).toContainText(String(A_ENVIAR));
  });

  test('desde Productos se puede dar de alta un producto', async ({ page }) => {
    // El boton era un enlace a /admin/centro-produccion, pensado para la
    // sucursal. Estando YA en el Centro apuntaba a la misma pantalla y no hacia
    // nada. Se verifica que abra el alta de verdad.
    await ingresar(page, DUENO);
    await irAlCentro(page, 'Productos');

    await page.getByRole('button', { name: /nuevo producto/i }).first().click();

    // Se busca la barra de pasos del wizard, que no existe en ninguna otra
    // pantalla: con un selector laxo el test pasaba igual con el boton roto.
    await expect(page.locator('.wizard-steps')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.wizard-step-label').first()).toContainText('1. Básicos');

    // Y desde el Centro solo se ofrecen las dos formas en que el Centro
    // abastece: producirlo o comprarlo.
    await expect(page.getByText('Terciado', { exact: true })).toHaveCount(0);
  });

  test('crear un insumo y despues un producto con su receta, y publicarlo', async ({ page }) => {
    // El recorrido exacto que reporto el usuario: en el Centro crea el insumo
    // (Carne) con stock, va a Productos, da de alta un producto (Lomito) con su
    // cantidad de carne, y al publicar el servidor respondia 422 "falta receta
    // con insumos y cantidades validas" — porque miraba la receta de VENTA, que
    // en un alta del Centro va vacia a proposito.
    const INSUMO_CARNE = unico('E2E Carne');
    const PRODUCTO_LOMITO = unico('E2E Lomito');

    await ingresar(page, DUENO);
    await irAlCentro(page, 'Insumo bruto');

    await page.getByRole('button', { name: /nuevo insumo/i }).first().click();
    await campoModal(page, 'Nombre').fill(INSUMO_CARNE);
    await campoModal(page, 'Stock inicial').fill('1000');
    await campoModal(page, 'Costo unitario').fill('0.04');
    await modal(page).getByRole('button', { name: /dar de alta/i }).click();
    await expect(modal(page)).toBeHidden({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Productos' }).click();
    await page.getByRole('button', { name: /nuevo producto/i }).first().click();
    await expect(page.locator('.wizard-steps')).toBeVisible({ timeout: 20_000 });

    // 1. Basicos: nombre, tipo elaborado y el menu donde aparece.
    await page.locator('.form-group', { hasText: 'Nombre' }).locator('input').first().fill(PRODUCTO_LOMITO);
    await page.locator('.type-card', { hasText: 'Elaborado' }).first().click();
    await page.locator('.form-group', { hasText: 'menú' }).locator('.type-card').first().click();
    await page.getByRole('button', { name: /siguiente/i }).click();

    // 2. Precio.
    await page.locator('.form-group', { hasText: 'Precio' }).locator('input').first().fill('35');
    await page.getByRole('button', { name: /siguiente/i }).click();

    // 3. Receta: se elige la carne recien creada y su cantidad.
    await page.getByRole('button', { name: /agregar insumo/i }).click();
    const buscador = page.getByPlaceholder('Buscar insumo...').first();
    await buscador.click();
    await buscador.fill(INSUMO_CARNE);
    await page.locator('div', { hasText: INSUMO_CARNE }).last().click();
    const cantidad = page.locator('input[placeholder="0"]').first();
    await cantidad.fill('200');
    await page.getByRole('button', { name: /siguiente/i }).click();

    // 4. Publicar. Esto es lo que fallaba.
    const [respuesta] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/admin/productos') && r.request().method() === 'POST', { timeout: 30_000 }),
      page.getByRole('button', { name: /publicar al menú/i }).click(),
    ]);
    expect(respuesta.status(), await respuesta.text()).toBe(201);

    // Aparece en la lista del CENTRO sin haber sido enviado a ningun lado: el
    // catalogo del Centro es el suyo, no el de una sucursal.
    await expect(page.locator('tr', { hasText: PRODUCTO_LOMITO }).first()).toBeVisible({ timeout: 20_000 });

    // Y NO quedo habilitado en ninguna sucursal: eso pasa recien cuando le
    // llega un envio.
    const habilitaciones = await page.evaluate(async (nombre) => {
      const lista = await (await fetch('/api/admin/productos', { credentials: 'include' })).json();
      const items = Array.isArray(lista) ? lista : lista?.data ?? lista?.items ?? [];
      const p = items.find((x: { nombre: string }) => x.nombre === nombre);
      return (p?.sucursales ?? []).length;
    }, PRODUCTO_LOMITO);
    expect(habilitaciones).toBe(0);

    // Al reabrirlo la receta sigue ahi: se lee de la del Centro, no de la
    // local, que en estos productos esta vacia a proposito.
    await page.locator('tr', { hasText: PRODUCTO_LOMITO }).first().getByTitle(/editar/i).first().click();
    await expect(page.locator('.wizard-steps')).toBeVisible({ timeout: 20_000 });

    // Se avanza paso a paso esperando que el indicador cambie: encadenar clics
    // hacia que el segundo llegara antes de que el wizard re-renderizara.
    const pasoActivo = page.locator('.wizard-step.active .wizard-step-label');
    await expect(pasoActivo).toContainText('1.');
    await page.getByRole('button', { name: /siguiente/i }).click();
    await expect(pasoActivo).toContainText('2.');
    await page.getByRole('button', { name: /siguiente/i }).click();
    await expect(pasoActivo).toContainText('3.');

    // El selector de insumo muestra el elegido como valor del input.
    await expect(page.getByPlaceholder('Buscar insumo...').first())
      .toHaveValue(new RegExp(INSUMO_CARNE), { timeout: 20_000 });
  });
});
