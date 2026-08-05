-- Nota del cliente en su pedido ("sin picante", "tocar timbre").
--
-- La escribe el cliente en el checkout web y la leen cocina y quien entrega,
-- así que vive con la venta. Aditivo y nullable: los pedidos que ya existen
-- simplemente no tienen nota.
ALTER TABLE "Transaccion" ADD COLUMN "notas" TEXT;
