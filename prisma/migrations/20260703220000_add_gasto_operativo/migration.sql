-- CreateTable
CREATE TABLE "GastoOperativo" (
    "id" SERIAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo_pago" "TipoCuenta" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "notas" TEXT,
    "creado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GastoOperativo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GastoOperativo_fecha_idx" ON "GastoOperativo"("fecha");

-- CreateIndex
CREATE INDEX "GastoOperativo_categoria_idx" ON "GastoOperativo"("categoria");

-- CreateIndex
CREATE INDEX "GastoOperativo_metodo_pago_idx" ON "GastoOperativo"("metodo_pago");
