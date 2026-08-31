import { expect, type Cookie, type Page } from '@playwright/test';

/**
 * Credenciales del seed (`prisma/seed.ts`). No son secretos: la BD de tests se
 * resiembra con estos usuarios en cada corrida.
 */
export const DUENO = { usuario: 'benjaherediaruiz@gmail.com', password: 'benja122' };
export const CAJERO = { usuario: 'cajero@elevate.com', password: 'cajero123' };

/**
 * Sesión ya obtenida por cada rol, para no repetir el formulario en cada test.
 *
 * No es solo velocidad: la app tiene rate-limit por IP+ruta, y una suite que
 * hace un login por test se lo come y empieza a recibir 429. El formulario se
 * ejerce igual —la primera vez de cada rol— y el redirect se verifica aparte en
 * smoke.spec.ts.
 */
const sesionPorRol = new Map<string, Cookie[]>();

/**
 * Login por la interfaz, no por API: el punto de un e2e es que el camino que
 * hace la persona funcione entero, y la sesión viaja en una cookie httpOnly que
 * el navegador tiene que recibir del propio flujo.
 */
export async function ingresar(page: Page, quien: { usuario: string; password: string }) {
  // Se limpia la sesión anterior antes de entrar: con una cookie válida, el
  // /login redirige solo al panel del rol que ya estaba y el formulario se
  // desmonta en medio del fill. Aparece al cambiar de usuario dentro de un
  // mismo test (dueño despacha → cajero recibe).
  await page.context().clearCookies();

  const guardada = sesionPorRol.get(quien.usuario);
  if (guardada) {
    await page.context().addCookies(guardada);
    return;
  }

  await page.goto('/login');
  await page.locator('#email').fill(quien.usuario);
  await page.locator('#password').fill(quien.password);

  // La señal de que el login funcionó es la respuesta del endpoint, no la
  // navegación: el redirect lo hace router.push del lado del cliente y no
  // siempre dispara un evento de carga, lo que volvía intermitente esperar por
  // la URL. Que el redirect ocurra se verifica aparte, en smoke.spec.ts.
  const [respuesta] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/auth/login') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click(),
  ]);
  expect(respuesta.ok(), `login de ${quien.usuario}: ${respuesta.status()}`).toBeTruthy();

  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 })
    .catch(() => { /* cada spec navega a su pantalla enseguida */ });

  sesionPorRol.set(quien.usuario, await page.context().cookies());
}

/** Fuerza un login por formulario, ignorando la sesión cacheada. */
export async function ingresarSinCache(page: Page, quien: { usuario: string; password: string }) {
  sesionPorRol.delete(quien.usuario);
  await ingresar(page, quien);
}

/** Nombre único por corrida: los e2e comparten la base con la suite de Vitest. */
export const unico = (prefijo: string) => `${prefijo} ${Date.now()}${Math.floor(Math.random() * 1000)}`;

/**
 * Lee un número de la pantalla ignorando el formato de moneda ("Bs 1.234,50").
 * Se usa para comparar totales antes y después de una acción.
 */
export function aNumero(texto: string): number {
  const limpio = texto.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const valor = Number(limpio);
  return Number.isNaN(valor) ? 0 : valor;
}

/** Espera a que una fila con ese texto exista en la tabla. */
export async function esperarFila(page: Page, texto: string) {
  const fila = page.locator('tr', { hasText: texto }).first();
  await expect(fila).toBeVisible({ timeout: 20_000 });
  return fila;
}

/**
 * Siembra un item de inventario en la sucursal, como se hace desde el corte:
 * creando un PRODUCTO en el Centro. Su insumo espejo es lo que la sucursal ve
 * y opera —merma, conteo, corrección de costo, baja—, porque desde la fase 3
 * el local ya no da de alta insumo bruto ni le compra a proveedores.
 *
 * Se usa `fetch` DENTRO de la página y no `page.request`: la sesión viaja en
 * una cookie httpOnly que el contexto de request no siempre arrastra, y un 401
 * acá se leería como "el alta falló" cuando en realidad faltó la sesión.
 */
export async function sembrarProductoConEspejo(
  page: Page,
  datos: { nombre: string; stock: number; costo: number; minimo?: number; sucursalNombre?: string },
): Promise<number> {
  await page.goto('/admin/centro-produccion');

  const resultado = await page.evaluate(async (d) => {
    // El espejo nace en la sucursal del alta. Sin esto iria a la principal, y
    // un spec que trabaja sobre un local propio no veria nunca su fila.
    let sucursalId: number | undefined;
    if (d.sucursalNombre) {
      const sucs = await (await fetch('/api/sucursales', { credentials: 'include' })).json();
      sucursalId = (sucs?.data ?? []).find((x: { nombre: string }) => x.nombre === d.sucursalNombre)?.id;
    }

    const centros = await (await fetch('/api/admin/centros-produccion', { credentials: 'include' })).json();
    let centroId: number | undefined = centros?.items?.[0]?.id;
    if (!centroId) {
      const creado = await (await fetch('/api/admin/centros-produccion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nombre: `Centro seed ${Date.now()}` }),
      })).json();
      centroId = creado?.data?.id;
    }

    const res = await fetch('/api/admin/productos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        nombre: d.nombre,
        descripcion: 'Sembrado por el E2E',
        precio: Math.max(1, Math.round(d.costo * 2)),
        tipo: 'REVENTA',
        // Borrador a propósito: publicar exige una carta donde aparecer, y lo que
        // se siembra acá es inventario, no catálogo de cara al cliente.
        estado_publicacion: 'BORRADOR',
        categorias: [], marcas: [], receta: [],
        permitir_duplicado: true,
        centro_id: centroId,
        sucursal_id: sucursalId,
        nuevo_insumo_reventa: {
          unidad_medida: 'UNIDAD',
          stock: d.stock,
          costo_unitario: d.costo,
          punto_reorden: d.minimo ?? 1,
        },
      }),
    });
    return { ok: res.ok, status: res.status, cuerpo: await res.text() };
  }, datos);

  if (!resultado.ok) {
    throw new Error(`No se pudo sembrar "${datos.nombre}": ${resultado.status} ${resultado.cuerpo}`);
  }

  const creado = JSON.parse(resultado.cuerpo).data as { id: number; insumo_reventa_id: number | null };

  // El stock inicial del alta entra al CENTRO: es el origen. Para que el local
  // lo tenga hay que despachárselo, que es exactamente como llega en la
  // realidad. Mover en vez de sembrar dos veces también mantiene bien el
  // consolidado: el negocio tiene lo que compró una sola vez.
  if (datos.stock > 0 && creado.insumo_reventa_id) {
    await despacharAlLocal(page, {
      insumoId: creado.insumo_reventa_id,
      sucursalNombre: datos.sucursalNombre ?? '',
      cantidad: datos.stock,
    });
  }

  return creado.id;
}

/** Despacha del Centro a una sucursal y lo recibe: el camino real de la mercadería. */
export async function despacharAlLocal(
  page: Page,
  datos: { insumoId: number; sucursalNombre: string; cantidad: number },
): Promise<void> {
  const resultado = await page.evaluate(async (d) => {
    const sucs = await (await fetch('/api/sucursales', { credentials: 'include' })).json();
    // Sin nombre, la primera: la principal, donde caen los specs que no crean
    // sucursal propia.
    const sucursalId = d.sucursalNombre
      ? (sucs?.data ?? []).find((x: { nombre: string }) => x.nombre === d.sucursalNombre)?.id
      : (sucs?.data ?? [])[0]?.id;

    const centros = await (await fetch('/api/admin/centros-produccion', { credentials: 'include' })).json();
    const centroId = centros?.items?.[0]?.id;

    const envio = await fetch('/api/admin/traslados', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        centro_id: centroId, sucursal_id: sucursalId,
        lineas: [{ insumo_id: d.insumoId, cantidad: d.cantidad }],
        observaciones: 'Despacho sembrado por el E2E',
      }),
    });
    if (!envio.ok) return { ok: false, status: envio.status, cuerpo: await envio.text() };

    const trasladoId = (await envio.json())?.data?.traslado?.id;
    const recibo = await fetch('/api/admin/traslados/recibir', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ traslado_id: trasladoId, recibido: [] }),
    });
    return { ok: recibo.ok, status: recibo.status, cuerpo: await recibo.text() };
  }, datos);

  if (!resultado.ok) {
    throw new Error(`No se pudo despachar el insumo ${datos.insumoId}: ${resultado.status} ${resultado.cuerpo}`);
  }
}

/**
 * Fija el stock de un insumo en una sucursal por API (conteo fisico).
 *
 * Es como un local que todavia no maneja ese insumo termina teniendolo: el
 * servicio crea la fila si falta. Reemplaza a "Agregar de otra sucursal", que
 * la fase 3 quito —copiar insumo bruto entre locales dejo de tener sentido
 * cuando el bruto vive solo en el Centro—.
 */
export async function fijarStockEnSucursal(
  page: Page,
  datos: { insumoNombre: string; sucursalNombre: string; stock: number; insumoId?: number },
): Promise<void> {
  const resultado = await page.evaluate(async (d) => {
    const sucs = await (await fetch('/api/sucursales', { credentials: 'include' })).json();
    // Sin nombre, la primera: es la principal, que es donde caen los specs que
    // no crean sucursales propias.
    const sucursalId = d.sucursalNombre
      ? (sucs?.data ?? []).find((x: { nombre: string }) => x.nombre === d.sucursalNombre)?.id
      : (sucs?.data ?? [])[0]?.id;

    // Con el id a mano no se busca: un espejo recién creado vive solo en el
    // Centro y los listados de insumo lo esconden a propósito —para que nadie
    // arme una ficha con algo que la sucursal no tiene—.
    let insumoId = d.insumoId;
    if (!insumoId) {
      const lista = await (await fetch('/api/insumo?incluir_inactivos=1', { credentials: 'include' })).json();
      insumoId = (Array.isArray(lista) ? lista : lista?.data ?? [])
        .find((i: { nombre: string }) => i.nombre === d.insumoNombre)?.id;
    }

    const res = await fetch('/api/admin/insumos/conteo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        insumo_id: insumoId,
        nuevo_stock: d.stock,
        sucursal_id: sucursalId,
        descripcion: 'Conteo sembrado por el E2E',
      }),
    });
    return { ok: res.ok, status: res.status, cuerpo: await res.text() };
  }, datos);

  if (!resultado.ok) {
    throw new Error(`No se pudo fijar el stock de "${datos.insumoNombre}": ${resultado.status} ${resultado.cuerpo}`);
  }
}
