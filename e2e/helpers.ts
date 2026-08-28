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
