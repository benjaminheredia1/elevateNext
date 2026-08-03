-- Privilegios por sucursal.
--
-- La columna es NULLABLE a propósito y significa algo: NULL = privilegio del
-- negocio, válido en todos los locales; con valor = solo descuenta en ese local.
-- Así conviven una promo general y el "Staff Fitbull", que no tiene por qué
-- darle descuento a alguien que compra en Sur.
--
-- Nada se borra: los privilegios existentes se atribuyen a la sucursal más
-- antigua, que es donde opera el negocio hoy y de donde salieron. El dueño puede
-- volver global cualquiera de ellos dejando el campo vacío.

ALTER TABLE "Privilegio" ADD COLUMN "sucursal_id" INTEGER;

UPDATE "Privilegio"
SET "sucursal_id" = (SELECT "id" FROM "Sucursal" ORDER BY "id" ASC LIMIT 1)
WHERE "sucursal_id" IS NULL;

CREATE INDEX "Privilegio_sucursal_id_idx" ON "Privilegio"("sucursal_id");

-- ON DELETE SET NULL: si se borra la sucursal, el privilegio no se pierde,
-- pasa a ser del negocio.
ALTER TABLE "Privilegio" ADD CONSTRAINT "Privilegio_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
