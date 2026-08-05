-- Tarifa de delivery por sucursal y costo de envío en la venta.
--
-- Cada local reparte en su zona, así que la tarifa es del local: una base que
-- cubre unos km y un monto por km adicional. Es el esquema que usan las
-- plataformas (PedidosYa: base + por km) y las tarifas municipales del rubro.
--
-- Los defaults son los propuestos y quedan editables desde /admin/sucursales:
-- Bs 8 hasta 2,5 km y Bs 2,50 por km adicional.
ALTER TABLE "Sucursal" ADD COLUMN "envio_base" DECIMAL(12,2) NOT NULL DEFAULT 8;
ALTER TABLE "Sucursal" ADD COLUMN "envio_km_incluidos" DOUBLE PRECISION NOT NULL DEFAULT 2.5;
ALTER TABLE "Sucursal" ADD COLUMN "envio_por_km" DECIMAL(12,2) NOT NULL DEFAULT 2.5;
ALTER TABLE "Sucursal" ADD COLUMN "envio_maximo" DECIMAL(12,2);
ALTER TABLE "Sucursal" ADD COLUMN "envio_radio_km" DOUBLE PRECISION;

-- El envío se cobra aparte de los productos: sin separarlo, el ticket promedio
-- y el food cost quedaban contaminados con la plata del reparto.
ALTER TABLE "Transaccion" ADD COLUMN "costo_envio" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Transaccion" ADD COLUMN "distancia_km" DOUBLE PRECISION;
