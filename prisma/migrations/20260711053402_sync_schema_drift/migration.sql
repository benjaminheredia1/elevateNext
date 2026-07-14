-- Captura el drift entre las migraciones versionadas y schema.prisma que se habia
-- introducido antes de esta migracion (probablemente via `prisma db push` directo
-- contra la BD antigua, sin generar migracion). Detectado y aplicado manualmente
-- al migrar a Supabase el 2026-07-11.

-- AlterEnum
ALTER TYPE "EstadoPublicacion" ADD VALUE 'BAJA';

-- AlterEnum
ALTER TYPE "Tipo_movimiento" ADD VALUE 'BAJA';

-- AlterTable
ALTER TABLE "Caja" ALTER COLUMN "monto_inicial" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "monto_final" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "ingresos" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "egresos" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "CuentaCorriente" ADD COLUMN     "cliente_id" INTEGER,
ADD COLUMN     "transaccion_id" INTEGER;

-- AlterTable
ALTER TABLE "Gasto" ALTER COLUMN "monto" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Insumo" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fecha_baja" TIMESTAMP(3),
ADD COLUMN     "motivo_baja" TEXT,
DROP COLUMN "unidad_medida",
ADD COLUMN     "unidad_medida" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "fecha_baja" TIMESTAMP(3),
ADD COLUMN     "motivo_baja" TEXT,
ALTER COLUMN "precio" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Transaccion" ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "TransaccionesDetalles" ALTER COLUMN "precio_unitario" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "descuentoAplicado" SET DATA TYPE DECIMAL(12,2);

-- DropEnum
DROP TYPE "Unidad_medida";

-- CreateTable
CREATE TABLE "UnidadMedida" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnidadMedida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioTrabajador" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "es_libre" BOOLEAN NOT NULL DEFAULT false,
    "hora_entrada" TEXT,
    "hora_salida" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HorarioTrabajador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaFeriado" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "nombre" TEXT NOT NULL,
    "sucursal_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiaFeriado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnidadMedida_nombre_key" ON "UnidadMedida"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioTrabajador_usuario_id_dia_semana_key" ON "HorarioTrabajador"("usuario_id", "dia_semana");

-- CreateIndex
CREATE UNIQUE INDEX "DiaFeriado_fecha_sucursal_id_key" ON "DiaFeriado"("fecha", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaCorriente_transaccion_id_key" ON "CuentaCorriente"("transaccion_id");

-- CreateIndex
CREATE INDEX "CuentaCorriente_cliente_id_idx" ON "CuentaCorriente"("cliente_id");

-- CreateIndex
CREATE INDEX "CuentaCorriente_vencimiento_idx" ON "CuentaCorriente"("vencimiento");

-- AddForeignKey
ALTER TABLE "CuentaCorriente" ADD CONSTRAINT "CuentaCorriente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaCorriente" ADD CONSTRAINT "CuentaCorriente_transaccion_id_fkey" FOREIGN KEY ("transaccion_id") REFERENCES "Transaccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioTrabajador" ADD CONSTRAINT "HorarioTrabajador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaFeriado" ADD CONSTRAINT "DiaFeriado_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
