-- CreateTable
CREATE TABLE "CentroProduccion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentroProduccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCentro" (
    "id" SERIAL NOT NULL,
    "centro_id" INTEGER NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "stock_actual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costo_promedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock_minimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "punto_critico" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_baja" TIMESTAMP(3),
    "motivo_baja" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCentro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCentro" (
    "id" SERIAL NOT NULL,
    "centro_id" INTEGER NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "tipo_movimiento" "Tipo_movimiento" NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "descripcion" TEXT NOT NULL,
    "costo_unitario" DOUBLE PRECISION,
    "responsable" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCentro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockCentro_centro_id_idx" ON "StockCentro"("centro_id");

-- CreateIndex
CREATE UNIQUE INDEX "StockCentro_centro_id_insumo_id_key" ON "StockCentro"("centro_id", "insumo_id");

-- CreateIndex
CREATE INDEX "MovimientoCentro_centro_id_created_at_idx" ON "MovimientoCentro"("centro_id", "created_at");

-- AddForeignKey
ALTER TABLE "StockCentro" ADD CONSTRAINT "StockCentro_centro_id_fkey" FOREIGN KEY ("centro_id") REFERENCES "CentroProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCentro" ADD CONSTRAINT "StockCentro_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCentro" ADD CONSTRAINT "MovimientoCentro_centro_id_fkey" FOREIGN KEY ("centro_id") REFERENCES "CentroProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCentro" ADD CONSTRAINT "MovimientoCentro_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
