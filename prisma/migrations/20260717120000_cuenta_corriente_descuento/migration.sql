-- Descuento posterior sobre una cuenta por cobrar (fiado): monto acumulado y motivo.
-- Aditivo: no toca datos existentes.
ALTER TABLE "CuentaCorriente" ADD COLUMN IF NOT EXISTS "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "CuentaCorriente" ADD COLUMN IF NOT EXISTS "motivo_descuento" TEXT;
