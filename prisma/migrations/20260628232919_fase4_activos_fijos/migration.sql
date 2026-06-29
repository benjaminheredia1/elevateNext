-- CreateTable
CREATE TABLE "ActivoFijo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "fecha_compra" TIMESTAMP(3) NOT NULL,
    "valor_original" DECIMAL(12,2) NOT NULL,
    "valor_actual" DECIMAL(12,2) NOT NULL,
    "depreciacion_pct" DECIMAL(5,2),
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivoFijo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivoFijo_activo_idx" ON "ActivoFijo"("activo");

-- CreateIndex
CREATE INDEX "ActivoFijo_categoria_idx" ON "ActivoFijo"("categoria");
