-- Pago mixto (QR + efectivo) en venta de caja: nuevo valor del enum.
-- Aditivo: no modifica ni elimina datos ni valores existentes.
ALTER TYPE "TipoCuenta" ADD VALUE IF NOT EXISTS 'MIXTO';
