-- Fase 1 multi-sucursal (paso 2 de 2): sucursal_id pasa a obligatorio.
--
-- Va en una migración aparte, DESPUÉS del backfill, para poder verificar que no
-- quedan nulos antes de cerrar la puerta. Si en producción quedara alguna fila
-- sin sucursal, esta migración falla sin dejar la tabla a medias.
--
-- La FK pasa de SET NULL a RESTRICT: con la columna obligatoria, anular al
-- borrar la sucursal es imposible. RESTRICT impide borrar una sucursal que
-- tenga ventas — que es justo lo que queremos: el histórico no se pierde.

ALTER TABLE "Transaccion" DROP CONSTRAINT "Transaccion_sucursal_id_fkey";

ALTER TABLE "Transaccion" ALTER COLUMN "sucursal_id" SET NOT NULL;

ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
