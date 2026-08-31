import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as POST_CENTRO } from '../../route';
import { GET, POST, DELETE } from './route';
import { PUT as PUT_INSUMO } from '@/app/api/insumo/[id]/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

describe('/api/admin/centros-produccion/[id]/insumos', () => {
  let centroId: number;
  const insumoIds: number[] = [];

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const pedir = (url: string, method: string, access_token: string, body?: unknown) =>
    new NextRequest(`http://localhost${url}`, {
      method,
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  afterAll(async () => {
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.insumo.deleteMany({ where: { id: { in: insumoIds } } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
  });

  it('da de alta un insumo con POST y aparece en el GET del inventario', async () => {
    const access_token = await token();
    const crear = await POST_CENTRO(pedir('/api/admin/centros-produccion', 'POST', access_token, { nombre: `Centro Ruta Test ${Date.now()}` }));
    centroId = (await crear.json()).data.id;

    const nombre = `Fideo ruta test ${Date.now()}`;
    const alta = await POST(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, 'POST', access_token, {
        nombre, unidad_medida: 'KG', stock_inicial: 15, costo_unitario: 4, stock_minimo: 3, punto_critico: 1,
      }),
      { params: Promise.resolve({ id: String(centroId) }) },
    );
    const body = await alta.json();
    expect(alta.status).toBe(201);
    insumoIds.push(body.data.insumo.id);

    const listado = await (await GET(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, 'GET', access_token),
      { params: Promise.resolve({ id: String(centroId) }) },
    )).json();
    const fila = listado.items.find((i: { insumo_id: number }) => i.insumo_id === body.data.insumo.id);
    expect(fila).toBeTruthy();
    expect(fila.stock_actual).toBe(15);
  });

  // El panel de inventario es el mismo componente que usa la sucursal
  // (NucleoInventario), y lee la fila con la forma de `Insumo` de
  // components/admin/inventario/comunes.tsx. Si el Centro no devuelve esa
  // forma, la tabla se dibuja con celdas vacías y sin decir por qué.
  it('devuelve los campos que el panel de inventario necesita', async () => {
    const access_token = await token();
    const sufijo = Date.now();

    const insumo = await prisma.insumo.create({
      data: {
        nombre: `Harina panel ${sufijo}`,
        unidad_medida: 'GR',
        stock_actual: 0,
        stock_minimo: 0,
        costo_promedio: 0,
        equivalencia_unidad: 'KG',
        equivalencia_cantidad: 1000,
      },
    });
    insumoIds.push(insumo.id);
    await prisma.stockCentro.create({
      data: {
        centro_id: centroId, insumo_id: insumo.id,
        stock_actual: 500, costo_promedio: 0.02, stock_minimo: 100, punto_critico: 50,
      },
    });

    const listado = await (await GET(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, 'GET', access_token),
      { params: Promise.resolve({ id: String(centroId) }) },
    )).json();
    const fila = listado.items.find((i: { insumo_id: number }) => i.insumo_id === insumo.id);

    expect(fila).toMatchObject({
      // `id` es lo que el núcleo usa como clave de fila y para sus acciones;
      // `insumo_id` se mantiene porque la pantalla del Centro ya lo consume.
      id: insumo.id,
      insumo_id: insumo.id,
      nombre: `Harina panel ${sufijo}`,
      unidad_medida: 'GR',
      stock_actual: 500,
      costo_promedio: 0.02,
      stock_minimo: 100,
      punto_critico: 50,
      es_mixto: false,
      equivalencia_unidad: 'KG',
      equivalencia_cantidad: 1000,
      activo: true,
      nivel: 'ok',
    });
    // El Centro no mide consumo diario ni guarda fecha/motivo de baja por
    // centro: van en null y el panel los trata como ausentes.
    expect(fila.uso_diario_promedio).toBeNull();
    expect(fila.fecha_baja).toBeNull();
    expect(fila.motivo_baja).toBeNull();
  });

  it('un CAJERO no puede dar de alta insumo en el centro: 403', async () => {
    const cajero_token = (await login('cajero@elevate.com', 'cajero123')).access_token;
    const res = await POST(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, 'POST', cajero_token, {
        nombre: 'No debería crearse', unidad_medida: 'KG',
      }),
      { params: Promise.resolve({ id: String(centroId) }) },
    );
    expect(res.status).toBe(403);
  });

  // Reutilizar un insumo del catálogo es el camino común en el Centro (fideo,
  // avena y carne ya están cargados desde las sucursales). Si la unidad pedida
  // difiere de la catalogada hay que rechazar: aceptarla en silencio mezcla
  // litros con mililitros en el mismo promedio ponderado y el costo queda mal
  // por un factor de 1000 sin que nadie se entere.
  it('si el nombre ya existe en el catálogo con otra unidad, rechaza con 409', async () => {
    const access_token = await token();
    const nombre = `Insumo unidad mixta ${Date.now()}`;

    const primeraAlta = await POST(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, 'POST', access_token, {
        nombre, unidad_medida: 'KG', stock_inicial: 5, costo_unitario: 2,
      }),
      { params: Promise.resolve({ id: String(centroId) }) },
    );
    const primerBody = await primeraAlta.json();
    expect(primeraAlta.status).toBe(201);
    insumoIds.push(primerBody.data.insumo.id);
    expect(primerBody.data.insumo.unidad_medida).toBe('KG');

    // Segundo centro para poder volver a dar de alta el mismo nombre (el
    // primer centro ya tiene este insumo en su inventario).
    const crearOtroCentro = await POST_CENTRO(pedir('/api/admin/centros-produccion', 'POST', access_token, { nombre: `Centro Ruta Test 2 ${Date.now()}` }));
    const otroCentroId = (await crearOtroCentro.json()).data.id;

    const segundaAlta = await POST(
      pedir(`/api/admin/centros-produccion/${otroCentroId}/insumos`, 'POST', access_token, {
        nombre, unidad_medida: 'LT', stock_inicial: 2, costo_unitario: 3,
      }),
      { params: Promise.resolve({ id: String(otroCentroId) }) },
    );
    const segundoBody = await segundaAlta.json();
    expect(segundaAlta.status).toBe(409);
    expect(segundoBody.error).toMatch(/KG/);

    // Con la unidad correcta sí entra, reutilizando el insumo del catálogo.
    const tercerAlta = await POST(
      pedir(`/api/admin/centros-produccion/${otroCentroId}/insumos`, 'POST', access_token, {
        nombre, unidad_medida: 'KG', stock_inicial: 2, costo_unitario: 3,
      }),
      { params: Promise.resolve({ id: String(otroCentroId) }) },
    );
    const tercerBody = await tercerAlta.json();
    expect(tercerAlta.status).toBe(201);
    expect(tercerBody.data.insumo.id).toBe(primerBody.data.insumo.id);

    await prisma.movimientoCentro.deleteMany({ where: { centro_id: otroCentroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: otroCentroId } });
    await prisma.centroProduccion.delete({ where: { id: otroCentroId } });
  });

  it('editar el insumo desde el centro le cambia el costo AL CENTRO', async () => {
    // Desde el corte el insumo bruto vive solo en el centro: si la edicion
    // escribe el costo en una sucursal —que ya ni lo lista— no cambia nada de
    // lo que se calcula con el (produccion, valorizado, costo de la ficha).
    const access_token = await token();
    const nombre = `Aceite editable ${Date.now()}`;
    const alta = await POST(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, 'POST', access_token, {
        nombre, unidad_medida: 'LT', stock_inicial: 5, costo_unitario: 10, stock_minimo: 1, punto_critico: 0,
      }),
      { params: Promise.resolve({ id: String(centroId) }) },
    );
    const insumoId = (await alta.json()).data.insumo.id as number;
    insumoIds.push(insumoId);

    const editado = await PUT_INSUMO(
      pedir(`/api/insumo/${insumoId}`, 'PUT', access_token, {
        centro_id: centroId, nombre: `${nombre} v2`, unidad_medida: 'LT',
        costo_promedio: 17, stock_minimo: 2, punto_critico: 1, proveedor: 'Proveedor nuevo',
      }),
      { params: Promise.resolve({ id: String(insumoId) }) },
    );
    expect(editado.status, JSON.stringify(await editado.clone().json())).toBe(200);

    const enCentro = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
    });
    expect(enCentro.costo_promedio).toBeCloseTo(17, 4);
    expect(enCentro.stock_minimo).toBe(2);
    // Y no se le invento inventario a ningun local.
    expect(await prisma.stockSucursal.count({ where: { insumo_id: insumoId } })).toBe(0);

    const catalogo = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    expect(catalogo.nombre).toBe(`${nombre} v2`);
    expect(catalogo.proveedor).toBe('Proveedor nuevo');
  });

  it('quitar del centro solo pasa sin stock y sin movimientos', async () => {
    const access_token = await token();
    const nombre = `Sal quitable ${Date.now()}`;
    const alta = await POST(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, 'POST', access_token, {
        nombre, unidad_medida: 'KG', stock_inicial: 3, costo_unitario: 2,
      }),
      { params: Promise.resolve({ id: String(centroId) }) },
    );
    const insumoId = (await alta.json()).data.insumo.id as number;
    insumoIds.push(insumoId);

    // Con stock encima, se rechaza: el kardex del centro es lo que respalda el
    // costo de todo lo que ya salio de ahi.
    const conStock = await DELETE(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, 'DELETE', access_token, { insumo_id: insumoId }),
      { params: Promise.resolve({ id: String(centroId) }) },
    );
    expect(conStock.status).toBe(409);

    // En cero pero con el movimiento del alta, tampoco.
    await prisma.stockCentro.update({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
      data: { stock_actual: 0 },
    });
    const conHistorial = await DELETE(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, 'DELETE', access_token, { insumo_id: insumoId }),
      { params: Promise.resolve({ id: String(centroId) }) },
    );
    expect(conHistorial.status).toBe(409);
    expect((await conHistorial.json()).error).toMatch(/Dar de baja/);

    // Limpio y sin historial, sale del inventario del centro sin tocar el
    // insumo del catalogo.
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId, insumo_id: insumoId } });
    const limpio = await DELETE(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, 'DELETE', access_token, { insumo_id: insumoId }),
      { params: Promise.resolve({ id: String(centroId) }) },
    );
    expect(limpio.status, JSON.stringify(await limpio.clone().json())).toBe(200);
    expect(await prisma.stockCentro.count({ where: { centro_id: centroId, insumo_id: insumoId } })).toBe(0);
    expect(await prisma.insumo.findUnique({ where: { id: insumoId } })).not.toBeNull();
  });
});
