-- Fase 3 del Centro de Producción: envíos del Centro a las sucursales.
-- Solo SQL aditivo: enum y tablas nuevas, ninguna tabla existente cambia.
--
-- Un solo sentido por decisión del negocio: al cerrar el turno no vuelve nada
-- al Centro, así que no hay devolución ni turno asociado.

CREATE TYPE "EstadoTraslado" AS ENUM ('EN_TRANSITO', 'RECIBIDO', 'ANULADO');

CREATE TABLE "Traslado" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoTraslado" NOT NULL DEFAULT 'EN_TRANSITO',
    "centro_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "enviado_por_id" INTEGER NOT NULL,
    "recibido_por_id" INTEGER,
    "fecha_envio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_recepcion" TIMESTAMP(3),
    "observaciones" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Traslado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrasladoDetalle" (
    "id" SERIAL NOT NULL,
    "traslado_id" INTEGER NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "cantidad_enviada" DOUBLE PRECISION NOT NULL,
    "cantidad_recibida" DOUBLE PRECISION,
    "costo_unitario" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "TrasladoDetalle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Traslado_idempotency_key_key" ON "Traslado"("idempotency_key");
CREATE UNIQUE INDEX "Traslado_centro_id_numero_key" ON "Traslado"("centro_id", "numero");
CREATE INDEX "Traslado_sucursal_id_estado_idx" ON "Traslado"("sucursal_id", "estado");
CREATE UNIQUE INDEX "TrasladoDetalle_traslado_id_insumo_id_key" ON "TrasladoDetalle"("traslado_id", "insumo_id");

ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_centro_id_fkey" FOREIGN KEY ("centro_id") REFERENCES "CentroProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_recibido_por_id_fkey" FOREIGN KEY ("recibido_por_id") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrasladoDetalle" ADD CONSTRAINT "TrasladoDetalle_traslado_id_fkey" FOREIGN KEY ("traslado_id") REFERENCES "Traslado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrasladoDetalle" ADD CONSTRAINT "TrasladoDetalle_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
