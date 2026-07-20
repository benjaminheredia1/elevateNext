-- Historial de pagos de cuentas corrientes (ledger inmutable).
-- SQL puramente aditivo: solo CREATE TABLE + índices, no toca datos existentes.
CREATE TABLE "CuentaCorrientePago" (
    "id" SERIAL NOT NULL,
    "cuenta_id" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo_pago" "TipoCuenta",
    "movimiento_caja_id" INTEGER,
    "creado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaCorrientePago_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CuentaCorrientePago_movimiento_caja_id_key" ON "CuentaCorrientePago"("movimiento_caja_id");

CREATE INDEX "CuentaCorrientePago_cuenta_id_idx" ON "CuentaCorrientePago"("cuenta_id");

ALTER TABLE "CuentaCorrientePago" ADD CONSTRAINT "CuentaCorrientePago_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "CuentaCorriente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CuentaCorrientePago" ADD CONSTRAINT "CuentaCorrientePago_movimiento_caja_id_fkey" FOREIGN KEY ("movimiento_caja_id") REFERENCES "MovimientoCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CuentaCorrientePago" ADD CONSTRAINT "CuentaCorrientePago_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
