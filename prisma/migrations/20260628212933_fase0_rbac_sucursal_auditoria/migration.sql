-- CreateEnum
CREATE TYPE "EstadoTransaccion" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO', 'PAGADO');

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('DUENO', 'ADMIN', 'CAJERO', 'CLIENTE');

-- CreateEnum
CREATE TYPE "AccionAuditoria" AS ENUM ('CREO', 'MODIFICO', 'ELIMINO', 'LOGIN', 'LOGOUT', 'APERTURA_CAJA', 'CIERRE_CAJA');

-- CreateEnum
CREATE TYPE "Unidad_medida" AS ENUM ('KG', 'GR', 'UNIDAD', 'LT', 'ML');

-- CreateEnum
CREATE TYPE "Tipo_movimiento" AS ENUM ('INGRESO', 'EGRESO', 'PRODUCCION');

-- CreateEnum
CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido_paterno" TEXT NOT NULL,
    "apellido_materno" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'CLIENTE',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_acceso" TIMESTAMP(3),
    "sucursal_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "direccion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaccion" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "cliente_id" INTEGER,
    "cliente_nombre" TEXT,
    "cliente_telefono" TEXT,
    "cliente_direccion" TEXT,
    "cliente_lat" DOUBLE PRECISION,
    "cliente_lng" DOUBLE PRECISION,
    "metodo_pago" TEXT,
    "total" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoTransaccion" NOT NULL DEFAULT 'PENDIENTE',
    "driver_nombre" TEXT,
    "driver_lat" DOUBLE PRECISION,
    "driver_lng" DOUBLE PRECISION,
    "driver_link_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "detalles" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "imagen_url" TEXT,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransaccionesDetalles" (
    "id" SERIAL NOT NULL,
    "transaccion_id" INTEGER NOT NULL,
    "precio_unitario" DOUBLE PRECISION NOT NULL,
    "descuentoAplicado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TransaccionesDetalles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriasProducto" (
    "id" SERIAL NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriasProducto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insumo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "stock_actual" DOUBLE PRECISION NOT NULL,
    "stock_minimo" DOUBLE PRECISION NOT NULL,
    "unidad_medida" "Unidad_medida" NOT NULL,
    "costo_promedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "es_mixto" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsumoMixtoDetalle" (
    "id" SERIAL NOT NULL,
    "insumo_padre_id" INTEGER NOT NULL,
    "insumo_hijo_id" INTEGER NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "InsumoMixtoDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecetasProducto" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "cantidad_utilizada" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecetasProducto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoInterno" (
    "id" SERIAL NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "tipo_movimiento" "Tipo_movimiento" NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "descripcion" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimientoInterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromocionProducto" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "promocion_descuentos_id" INTEGER NOT NULL,

    CONSTRAINT "PromocionProducto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromocionesDescuentos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "PromocionesDescuentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglasHorarias" (
    "id" SERIAL NOT NULL,
    "promocionesDescuentos_id" INTEGER NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReglasHorarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "sucursal_lat" DOUBLE PRECISION NOT NULL,
    "sucursal_lng" DOUBLE PRECISION NOT NULL,
    "sucursal_nombre" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caja" (
    "id" SERIAL NOT NULL,
    "monto_inicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monto_final" DOUBLE PRECISION,
    "ingresos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "egresos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado" "EstadoCaja" NOT NULL DEFAULT 'ABIERTA',
    "fecha_apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMP(3),
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" SERIAL NOT NULL,
    "caja_id" INTEGER NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "descripcion" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sucursal" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAuditoria" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "rol" "Rol" NOT NULL,
    "accion" "AccionAuditoria" NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "detalle" TEXT NOT NULL,
    "monto" DECIMAL(12,2),
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_username_key" ON "Usuario"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Transaccion_driver_link_id_key" ON "Transaccion"("driver_link_id");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_usuario_id_idx" ON "RegistroAuditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_created_at_idx" ON "RegistroAuditoria"("created_at");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_entidad_idx" ON "RegistroAuditoria"("entidad");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransaccionesDetalles" ADD CONSTRAINT "TransaccionesDetalles_transaccion_id_fkey" FOREIGN KEY ("transaccion_id") REFERENCES "Transaccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransaccionesDetalles" ADD CONSTRAINT "TransaccionesDetalles_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriasProducto" ADD CONSTRAINT "CategoriasProducto_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriasProducto" ADD CONSTRAINT "CategoriasProducto_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsumoMixtoDetalle" ADD CONSTRAINT "InsumoMixtoDetalle_insumo_padre_id_fkey" FOREIGN KEY ("insumo_padre_id") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsumoMixtoDetalle" ADD CONSTRAINT "InsumoMixtoDetalle_insumo_hijo_id_fkey" FOREIGN KEY ("insumo_hijo_id") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetasProducto" ADD CONSTRAINT "RecetasProducto_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetasProducto" ADD CONSTRAINT "RecetasProducto_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInterno" ADD CONSTRAINT "MovimientoInterno_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromocionProducto" ADD CONSTRAINT "PromocionProducto_promocion_descuentos_id_fkey" FOREIGN KEY ("promocion_descuentos_id") REFERENCES "PromocionesDescuentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromocionProducto" ADD CONSTRAINT "PromocionProducto_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglasHorarias" ADD CONSTRAINT "ReglasHorarias_promocionesDescuentos_id_fkey" FOREIGN KEY ("promocionesDescuentos_id") REFERENCES "PromocionesDescuentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAuditoria" ADD CONSTRAINT "RegistroAuditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
