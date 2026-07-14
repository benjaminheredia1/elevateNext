import prisma from './lib/prisma';

async function main() {
  const productos = await prisma.producto.findMany({
    where: { nombre: { equals: 'Prueba2', mode: 'insensitive' } },
    include: {
      _count: {
        select: {
          transaccionesDetalles_id: true,
          recetaProducto_id: true,
          categoria_id: true,
          marcas: true,
          promocionProducto_id: true,
        },
      },
    },
  });
  if (productos.length === 0) {
    console.log('No existe ningún producto llamado "Prueba2"');
    // por si el nombre es aproximado:
    const similares = await prisma.producto.findMany({
      where: { nombre: { contains: 'rueba', mode: 'insensitive' } },
      select: { id: true, nombre: true, estado_publicacion: true },
    });
    console.log('Similares:', JSON.stringify(similares));
    return;
  }
  for (const p of productos) {
    console.log(`#${p.id} "${p.nombre}" estado=${p.estado_publicacion} disponible=${p.disponible}`);
    console.log(`  ventas=${p._count.transaccionesDetalles_id} receta=${p._count.recetaProducto_id} categorias=${p._count.categoria_id} marcas=${p._count.marcas} promos=${p._count.promocionProducto_id}`);
  }
}

main().finally(() => prisma.$disconnect());
