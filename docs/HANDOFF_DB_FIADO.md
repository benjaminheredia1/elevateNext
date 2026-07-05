# Handoff BD: módulo de fiado / privilegios / gastos operativos

**Para:** quien despliega a producción
**De:** branch `feat/caja-pedidos-pagos`
**Fecha:** 2026-07-05

## Qué pasó

Entre el 04 y 05 de julio, la BD compartida (`db.prisma.io`) perdió las tablas
`Privilegio`, `ClientePrivilegio`, `GastoOperativo` y las columnas
`cliente_id`/`transaccion_id` de `CuentaCorriente` — casi seguro por un
`prisma db push` (o `migrate dev`) hecho desde un branch cuyo `schema.prisma`
no incluye esos modelos. Eso dejó **rotas en producción** la venta al fiado y
la vista de deudores de la caja.

Ya se restauraron manualmente el 05/07 con SQL aditivo, **sin tocar** las
columnas nuevas de otros branches (`Insumo.activo`, `fecha_baja`,
`motivo_baja`, etc.).

## Qué necesito de ti

1. **Fusionar el `schema.prisma` de `feat/caja-pedidos-pagos`** con el tuyo
   antes de cualquier deploy. Los modelos que tu schema debe incluir sí o sí:
   - `Privilegio`, `ClientePrivilegio` (descuentos por tipo de cliente)
   - `GastoOperativo`
   - En `CuentaCorriente`: los campos `cliente_id` y `transaccion_id`
     (relaciones opcionales a `Cliente` y `Transaccion`) con sus índices.
   - En `Cliente`: las relaciones `cuentas_corrientes` y `privilegios`.
   - En `Transaccion`: la relación `cuenta_corriente`.

2. **No correr `prisma db push` ni `prisma migrate dev`** contra la BD
   compartida desde un schema que no tenga esos modelos: los vuelve a borrar.
   Regla práctica: antes de aplicar nada, correr
   `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
   y revisar que no aparezca ningún `DROP` inesperado.

3. Si las tablas vuelven a perderse, correr `scripts/handoff-fiado.sql`
   (100% aditivo e idempotente — se puede ejecutar las veces que sea):
   ```
   psql "$DATABASE_URL" -f scripts/handoff-fiado.sql
   ```
   o desde Node sin psql:
   ```
   node --env-file=.env -e "const{Pool}=require('pg');const f=require('fs').readFileSync('scripts/handoff-fiado.sql','utf8');const p=new Pool({connectionString:process.env.DATABASE_URL.replace(/\?.*$/,''),ssl:{rejectUnauthorized:false}});p.query(f).then(()=>{console.log('ok');p.end()}).catch(e=>{console.error(e.message);p.end()})"
   ```

## Qué depende de esto en el código de caja

- `POST /api/caja/venta` con `es_fiado: true` → crea `CuentaCorriente` ligada
  a la transacción y al cliente.
- `GET /api/caja/deudores` y `POST /api/caja/deudores/[id]/pago` → lista y
  cobra deudas.
- Descuento por privilegio del cliente en ventas de mostrador.
- `GastoOperativo` para el registro contable de gastos.

Si falta cualquiera de las estructuras, esos endpoints devuelven **500** con
`TableDoesNotExist` / `ColumnNotFound`.
