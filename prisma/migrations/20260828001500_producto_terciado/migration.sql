-- Fase 4 del Centro de Producción: tipo de producto TERCIADO.
--
-- Aditivo puro: agrega un valor al enum. Ningún producto existente cambia de
-- tipo, y en toda la lógica de venta TERCIADO se comporta como REVENTA
-- (descuenta 1:1 su insumo espejo). Se distingue solo para catálogo y reportes,
-- porque su stock no se compra: se produce en el Centro.
--
-- Desde PostgreSQL 12 esto puede correr dentro de una transacción mientras el
-- valor nuevo no se USE en la misma transacción, que es el caso: acá solo se
-- declara.

ALTER TYPE "ProductoTipo" ADD VALUE IF NOT EXISTS 'TERCIADO';
