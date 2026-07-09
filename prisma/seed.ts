import prisma from '../lib/prisma'
import bcrypt from 'bcryptjs'
import { Rol, TipoCuenta } from '@prisma/client'

async function main() {
  // 1. Sucursal por defecto (migra datos de Configuracion si existe)
  let sucursal = await prisma.sucursal.findFirst()
  if (!sucursal) {
    const config = await prisma.configuracion.findFirst()
    sucursal = await prisma.sucursal.create({
      data: {
        nombre: config?.sucursal_nombre ?? 'Sucursal Principal',
        lat: config?.sucursal_lat ?? null,
        lng: config?.sucursal_lng ?? null,
      },
    })
    console.log(`✅ Sucursal creada: ${sucursal.nombre}`)
  } else {
    console.log(`ℹ️ Sucursal ya existe: ${sucursal.nombre}`)
  }

  // 2. Usuarios base con roles (idempotente vía upsert)
  // NOTA: la contraseña solo se aplica en 'create', nunca en 'update',
  // para que un cambio manual de contraseña no se revierta en cada deploy.
  const usuarios = [
    { email: 'benjaherediaruiz@gmail.com', username: 'admin', nombre: 'Admin',
      rol: Rol.DUENO, password: 'benja122', sucursal_id: null as number | null },
    { email: 'cajero@elevate.com', username: 'cajero', nombre: 'Cajero',
      rol: Rol.CAJERO, password: 'cajero123', sucursal_id: sucursal.id },
    { email: 'saul@gmail.com', username: 'Saul', nombre: 'Saul',
      rol: Rol.DUENO, password: 'terere25', sucursal_id: null as number | null },
  ]

  for (const u of usuarios) {
    const hash = await bcrypt.hash(u.password, 10)
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {
        username: u.username,
        rol: u.rol,
        activo: true,
        sucursal_id: u.sucursal_id,
      },
      create: {
        nombre: u.nombre,
        apellido_paterno: 'Sistema',
        apellido_materno: '',
        email: u.email,
        username: u.username,
        password: hash,
        token: '',
        rol: u.rol,
        activo: true,
        sucursal_id: u.sucursal_id,
      },
    })
    console.log(`✅ Usuario ${u.username} (${u.rol})`)
  }

  // 3. Cuentas financieras (Efectivo / QR) de la sucursal
  const sucParaCuentas = await prisma.sucursal.findFirst()
  if (sucParaCuentas) {
    for (const tipo of [TipoCuenta.EFECTIVO, TipoCuenta.QR]) {
      await prisma.cuentaFinanciera.upsert({
        where: { sucursal_id_tipo: { sucursal_id: sucParaCuentas.id, tipo } },
        update: {},
        create: { sucursal_id: sucParaCuentas.id, tipo, nombre: `Caja ${tipo}` },
      })
    }
    console.log('✅ Cuentas financieras (EFECTIVO, QR)')
  }
  // 4. Marcas (FASE 5A) — upsert idempotente por key
  const marcas = [
    { key: 'elevate', nombre: 'Elevate', color: '#22c55e' },
    { key: 'fitbull', nombre: 'Fitbull', color: '#f59e0b' },
  ]
  for (const m of marcas) {
    await prisma.marca.upsert({
      where: { key: m.key },
      update: { nombre: m.nombre, color: m.color },
      create: m,
    })
    console.log(`✅ Marca: ${m.nombre} (${m.key})`)
  }

  // 5. Unidades de medida (catálogo administrable) — upsert idempotente por nombre
  const unidadesBase = ['KG', 'GR', 'UNIDAD', 'LT', 'ML']
  for (const nombre of unidadesBase) {
    await prisma.unidadMedida.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    })
  }
  console.log('✅ Unidades de medida base (KG, GR, UNIDAD, LT, ML)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
