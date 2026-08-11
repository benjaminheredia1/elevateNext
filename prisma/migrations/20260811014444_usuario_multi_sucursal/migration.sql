-- CreateTable
CREATE TABLE "UsuarioSucursal" (
    "usuario_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioSucursal_pkey" PRIMARY KEY ("usuario_id","sucursal_id")
);

-- CreateIndex
CREATE INDEX "UsuarioSucursal_sucursal_id_idx" ON "UsuarioSucursal"("sucursal_id");

-- AddForeignKey
ALTER TABLE "UsuarioSucursal" ADD CONSTRAINT "UsuarioSucursal_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioSucursal" ADD CONSTRAINT "UsuarioSucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: quien ya tenia una sucursal asignada conserva exactamente ese
-- alcance. Sin esto, al desplegar, todo cajero y admin quedaria sin sucursales
-- y dejaria de ver sus propios datos.
INSERT INTO "UsuarioSucursal" ("usuario_id", "sucursal_id")
SELECT u."id", u."sucursal_id"
FROM "Usuario" u
WHERE u."sucursal_id" IS NOT NULL
ON CONFLICT DO NOTHING;
