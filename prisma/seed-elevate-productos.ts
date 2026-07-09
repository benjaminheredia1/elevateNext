/**
 * Script de carga: Productos Elevate Snack
 * Ejecutar con: npx tsx prisma/seed-elevate-productos.ts
 *
 * Crea:
 *  - Categorías: Snack Elevate, Bolitas Proteicas, Terciados
 *  - Insumos (ingredientes) compartidos y deduplcados
 *  - Productos ELABORADOS con recetas
 *  - Productos TERCIADOS (reventa) con insumo de stock
 *  - Vinculación a la marca "elevate"
 */

import prisma from '../lib/prisma'
import { ProductoTipo, EstadoPublicacion } from '@prisma/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertCategoria(nombre: string) {
  let cat = await prisma.categoria.findFirst({ where: { nombre } })
  if (!cat) {
    cat = await prisma.categoria.create({ data: { nombre, detalles: nombre } })
    console.log(`  📁 Categoría creada: ${nombre}`)
  }
  return cat
}

async function upsertInsumo(
  nombre: string,
  unidad_medida: string,
  costo_promedio = 0,
) {
  let ins = await prisma.insumo.findFirst({ where: { nombre } })
  if (!ins) {
    ins = await prisma.insumo.create({
      data: {
        nombre,
        unidad_medida,
        stock_actual: 0,
        stock_minimo: 0,
        punto_critico: 0,
        costo_promedio,
      },
    })
  }
  return ins
}

async function crearProducto(datos: {
  nombre: string
  descripcion: string
  precio: number
  calorias?: number
  proteina?: string
  tipo?: ProductoTipo
  categorias: number[]
  marcaKey?: string
  insumo_reventa_id?: number
}) {
  const existente = await prisma.producto.findFirst({ where: { nombre: datos.nombre } })
  if (existente) {
    console.log(`  ⚠️  Ya existe: ${datos.nombre}`)
    return existente
  }

  const marca = datos.marcaKey
    ? await prisma.marca.findFirst({ where: { key: datos.marcaKey } })
    : null

  const producto = await prisma.producto.create({
    data: {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      precio: datos.precio,
      calorias: datos.calorias,
      proteina: datos.proteina,
      tipo: datos.tipo ?? ProductoTipo.ELABORADO,
      estado_publicacion: EstadoPublicacion.PUBLICADO,
      disponible: true,
      insumo_reventa_id: datos.insumo_reventa_id ?? null,
      categoria_id: {
        create: datos.categorias.map((cat_id) => ({ categoria_id: cat_id })),
      },
      ...(marca
        ? { marcas: { create: [{ marca_id: marca.id }] } }
        : {}),
    },
  })

  console.log(`  ✅ Producto: ${datos.nombre}`)
  return producto
}

async function crearReceta(
  producto_id: number,
  receta: { insumo_id: number; cantidad: number }[],
) {
  for (const item of receta) {
    const existe = await prisma.recetasProducto.findFirst({
      where: { producto_id, insumo_id: item.insumo_id },
    })
    if (!existe) {
      await prisma.recetasProducto.create({
        data: { producto_id, insumo_id: item.insumo_id, cantidad_utilizada: item.cantidad },
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🌱 Iniciando carga de Productos Elevate...\n')

  // ── Categorías ─────────────────────────────────────────────────────────────
  const catSnack    = await upsertCategoria('Snack Elevate')
  const catBolitas  = await upsertCategoria('Bolitas Proteicas')
  const catTerciad  = await upsertCategoria('Terciados')

  // ── Insumos compartidos (elaborados) ──────────────────────────────────────
  console.log('\n📦 Insumos...')
  const I = {
    tortilla:        await upsertInsumo('Tortilla de maíz',       'UNIDAD'),
    lomito:          await upsertInsumo('Lomito',                  'GR'),
    cebolla_blanca:  await upsertInsumo('Cebolla blanca',          'GR'),
    mozzarella:      await upsertInsumo('Mozzarella (lonja)',       'UNIDAD'),
    pechuga:         await upsertInsumo('Pechuga de pollo',         'GR'),
    pico_gallo:      await upsertInsumo('Pico de gallo',           'GR'),
    pan_ciabata:     await upsertInsumo('Pan ciabata',             'UNIDAD'),
    champinones:     await upsertInsumo('Champiñones',             'UNIDAD'),
    ceb_caramel:     await upsertInsumo('Cebolla caramelizada',    'GR'),
    salsa_pesto:     await upsertInsumo('Salsa pesto',             'GR'),
    tomate:          await upsertInsumo('Tomate',                  'GR'),
    avena:           await upsertInsumo('Avena',                   'GR'),
    proteina_polvo:  await upsertInsumo('Proteína en polvo',       'GR'),
    banana:          await upsertInsumo('Banana',                  'UNIDAD'),
    huevo:           await upsertInsumo('Huevo entero',            'UNIDAD'),
    polvo_hornear:   await upsertInsumo('Polvo de hornear',        'GR'),
    vainilla:        await upsertInsumo('Vainilla',                'GR'),
    frutilla:        await upsertInsumo('Frutilla',                'GR'),
    miel:            await upsertInsumo('Miel',                    'GR'),
    mant_mani:       await upsertInsumo('Mantequilla de maní',     'GR'),
    clara:           await upsertInsumo('Clara de huevo',          'GR'),
    agua:            await upsertInsumo('Agua',                    'ML'),
    manzana:         await upsertInsumo('Manzana roja',            'GR'),
    canela:          await upsertInsumo('Canela',                  'GR'),
    coco:            await upsertInsumo('Coco rallado',            'GR'),
    sesamo:          await upsertInsumo('Sésamo',                  'GR'),
    chocolate:       await upsertInsumo('Chocolate cobertura',     'GR'),
    yogurt:          await upsertInsumo('Yogurt griego',           'GR'),
    aceite_coco:     await upsertInsumo('Aceite de coco',          'GR'),
    cocoa:           await upsertInsumo('Cocoa amarga',            'GR'),
    mani:            await upsertInsumo('Maní triturado',          'GR'),
  }
  console.log('  ✅ Insumos listos')

  // ── Productos ELABORADOS ───────────────────────────────────────────────────
  console.log('\n🍽️  Productos elaborados...')

  // Beef Quesadilla
  const beefQues = await crearProducto({
    nombre: 'Beef Quesadilla',
    descripcion: '295kcal · 32P / 16C / 11G',
    precio: 35,
    calorias: 295,
    proteina: '32P/16C/11G',
    categorias: [catSnack.id],
    marcaKey: 'elevate',
  })
  await crearReceta(beefQues.id, [
    { insumo_id: I.tortilla.id,       cantidad: 1   },
    { insumo_id: I.lomito.id,         cantidad: 120 },
    { insumo_id: I.cebolla_blanca.id, cantidad: 50  },
    { insumo_id: I.mozzarella.id,     cantidad: 1   },
  ])

  // Chicken Quesadilla
  const chickQues = await crearProducto({
    nombre: 'Chicken Quesadilla',
    descripcion: '271kcal · 34P / 13C / 8G',
    precio: 25,
    calorias: 271,
    proteina: '34P/13C/8G',
    categorias: [catSnack.id],
    marcaKey: 'elevate',
  })
  await crearReceta(chickQues.id, [
    { insumo_id: I.tortilla.id,       cantidad: 1   },
    { insumo_id: I.pechuga.id,        cantidad: 120 },
    { insumo_id: I.pico_gallo.id,     cantidad: 20  },
    { insumo_id: I.mozzarella.id,     cantidad: 1   },
  ])

  // Steak & Mozzarella Panini
  const steakPanini = await crearProducto({
    nombre: 'Steak & Mozzarella Panini',
    descripcion: '510kcal · 37P / 43C / 20G',
    precio: 35,
    calorias: 510,
    proteina: '37P/43C/20G',
    categorias: [catSnack.id],
    marcaKey: 'elevate',
  })
  await crearReceta(steakPanini.id, [
    { insumo_id: I.pan_ciabata.id,    cantidad: 1   },
    { insumo_id: I.lomito.id,         cantidad: 120 },
    { insumo_id: I.champinones.id,    cantidad: 15  },
    { insumo_id: I.ceb_caramel.id,    cantidad: 15  },
    { insumo_id: I.mozzarella.id,     cantidad: 1   },
  ])

  // Panini Pesto Pollo
  const pestoPanini = await crearProducto({
    nombre: 'Panini Pesto Pollo',
    descripcion: '526kcal · 41P / 39C / 22G',
    precio: 25,
    calorias: 526,
    proteina: '41P/39C/22G',
    categorias: [catSnack.id],
    marcaKey: 'elevate',
  })
  await crearReceta(pestoPanini.id, [
    { insumo_id: I.pan_ciabata.id,  cantidad: 1   },
    { insumo_id: I.salsa_pesto.id,  cantidad: 20  },
    { insumo_id: I.pechuga.id,      cantidad: 120 },
    { insumo_id: I.tomate.id,       cantidad: 20  },
    { insumo_id: I.mozzarella.id,   cantidad: 1   },
  ])

  // Pancakes
  const pancakes = await crearProducto({
    nombre: 'Pancakes',
    descripcion: '567kcal · 29P / 61C / 23G · Porción: 3 unidades',
    precio: 25,
    calorias: 567,
    proteina: '29P/61C/23G',
    categorias: [catSnack.id],
    marcaKey: 'elevate',
  })
  await crearReceta(pancakes.id, [
    { insumo_id: I.avena.id,          cantidad: 50  },
    { insumo_id: I.proteina_polvo.id, cantidad: 10  },
    { insumo_id: I.banana.id,         cantidad: 1   },
    { insumo_id: I.huevo.id,          cantidad: 2   },
    { insumo_id: I.polvo_hornear.id,  cantidad: 5   },
    { insumo_id: I.vainilla.id,       cantidad: 5   },
    { insumo_id: I.frutilla.id,       cantidad: 20  },
    { insumo_id: I.miel.id,           cantidad: 15  },
    { insumo_id: I.mant_mani.id,      cantidad: 15  },
  ])

  // Crepes
  const crepes = await crearProducto({
    nombre: 'Crepes',
    descripcion: '173kcal · 20P / 22C / 1G · Porción: 2 unidades',
    precio: 25,
    calorias: 173,
    proteina: '20P/22C/1G',
    categorias: [catSnack.id],
    marcaKey: 'elevate',
  })
  await crearReceta(crepes.id, [
    { insumo_id: I.clara.id,          cantidad: 120 },
    { insumo_id: I.proteina_polvo.id, cantidad: 10  },
    { insumo_id: I.agua.id,           cantidad: 85  },
    { insumo_id: I.vainilla.id,       cantidad: 6   },
    { insumo_id: I.manzana.id,        cantidad: 60  },
    { insumo_id: I.canela.id,         cantidad: 2   },
    { insumo_id: I.miel.id,           cantidad: 15  },
  ])

  // ── Bolitas Proteicas ──────────────────────────────────────────────────────
  console.log('\n🟤  Bolitas proteicas...')

  // Chocolate Protein Truffles
  const chocTruff = await crearProducto({
    nombre: 'Chocolate Protein Truffles',
    descripcion: '156kcal · 6P / 16C / 7G · Precio por unidad',
    precio: 8,
    calorias: 156,
    proteina: '6P/16C/7G',
    categorias: [catBolitas.id],
    marcaKey: 'elevate',
  })
  await crearReceta(chocTruff.id, [
    { insumo_id: I.avena.id,          cantidad: 150 },
    { insumo_id: I.coco.id,           cantidad: 10  },
    { insumo_id: I.sesamo.id,         cantidad: 10  },
    { insumo_id: I.mant_mani.id,      cantidad: 40  },
    { insumo_id: I.proteina_polvo.id, cantidad: 20  },
    { insumo_id: I.miel.id,           cantidad: 20  },
    { insumo_id: I.chocolate.id,      cantidad: 80  },
  ])

  // Coconut Protein Truffles
  const cocoTruff = await crearProducto({
    nombre: 'Coconut Protein Truffles',
    descripcion: '120kcal · 3P / 5C / 10G · Precio por unidad',
    precio: 8,
    calorias: 120,
    proteina: '3P/5C/10G',
    categorias: [catBolitas.id],
    marcaKey: 'elevate',
  })
  await crearReceta(cocoTruff.id, [
    { insumo_id: I.coco.id,           cantidad: 120 },
    { insumo_id: I.proteina_polvo.id, cantidad: 20  },
    { insumo_id: I.yogurt.id,         cantidad: 60  },
    { insumo_id: I.miel.id,           cantidad: 20  },
    { insumo_id: I.aceite_coco.id,    cantidad: 20  },
    { insumo_id: I.mant_mani.id,      cantidad: 10  },
  ])

  // Brownie Protein Truffles
  const brownieTruff = await crearProducto({
    nombre: 'Brownie Protein Truffles',
    descripcion: '104kcal · 6P / 13C / 4G · Precio por unidad',
    precio: 8,
    calorias: 104,
    proteina: '6P/13C/4G',
    categorias: [catBolitas.id],
    marcaKey: 'elevate',
  })
  await crearReceta(brownieTruff.id, [
    { insumo_id: I.avena.id,          cantidad: 120 },
    { insumo_id: I.cocoa.id,          cantidad: 40  },
    { insumo_id: I.mant_mani.id,      cantidad: 40  },
    { insumo_id: I.yogurt.id,         cantidad: 30  },
    { insumo_id: I.proteina_polvo.id, cantidad: 20  },
    { insumo_id: I.miel.id,           cantidad: 20  },
    { insumo_id: I.mani.id,           cantidad: 15  },
  ])

  // ── Productos TERCIADOS (Reventa) ──────────────────────────────────────────
  console.log('\n🛒  Productos terciados...')

  const terciados: {
    nombre: string
    precio: number
    costo: number
    descripcion?: string
  }[] = [
    { nombre: 'Protein Crisp Bar',             precio: 20,  costo: 12.80 },
    { nombre: 'DarkBar',                        precio: 30,  costo: 20    },
    { nombre: 'C4',                             precio: 32,  costo: 28    },
    { nombre: 'B4',                             precio: 28,  costo: 20    },
    { nombre: 'Powerade 473ml',                 precio: 10,  costo: 4.5  },
    { nombre: 'Coca Cola Zero',                 precio: 10,  costo: 4.5  },
    { nombre: 'Agua Vital 600ml',               precio: 10,  costo: 4.5  },
    { nombre: 'Agua Vital 600ml (con gas)',      precio: 10,  costo: 4.5  },
    { nombre: 'Santé Sport',                    precio: 10,  costo: 6.3  },
    { nombre: 'Santé Zero',                     precio: 10,  costo: 6.5  },
    { nombre: 'Alfajor Nené Rice',              precio: 25,  costo: 17.5 },
    { nombre: 'Alfajor Nené Rice (Bonobom)',     precio: 25,  costo: 18   },
  ]

  for (const t of terciados) {
    const insumoStock = await upsertInsumo(t.nombre, 'UNIDAD', t.costo)

    const existente = await prisma.producto.findFirst({ where: { nombre: t.nombre } })
    if (existente) {
      console.log(`  ⚠️  Ya existe: ${t.nombre}`)
      continue
    }

    const marca = await prisma.marca.findFirst({ where: { key: 'elevate' } })

    await prisma.producto.create({
      data: {
        nombre: t.nombre,
        descripcion: t.descripcion ?? t.nombre,
        precio: t.precio,
        tipo: ProductoTipo.REVENTA,
        estado_publicacion: EstadoPublicacion.PUBLICADO,
        disponible: true,
        insumo_reventa_id: insumoStock.id,
        categoria_id: {
          create: [{ categoria_id: catTerciad.id }],
        },
        ...(marca ? { marcas: { create: [{ marca_id: marca.id }] } } : {}),
      },
    })
    console.log(`  ✅ Terciado: ${t.nombre} — venta: ${t.precio}bs / costo: ${t.costo}bs`)
  }

  console.log('\n🎉 Carga completada.\n')
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
