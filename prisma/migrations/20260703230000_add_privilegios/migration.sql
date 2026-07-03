-- CreateTable
CREATE TABLE "Privilegio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Privilegio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientePrivilegio" (
    "cliente_id" INTEGER NOT NULL,
    "privilegio_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientePrivilegio_pkey" PRIMARY KEY ("cliente_id","privilegio_id")
);

-- CreateIndex
CREATE INDEX "Privilegio_activo_idx" ON "Privilegio"("activo");

-- CreateIndex
CREATE INDEX "ClientePrivilegio_privilegio_id_idx" ON "ClientePrivilegio"("privilegio_id");

-- AddForeignKey
ALTER TABLE "ClientePrivilegio" ADD CONSTRAINT "ClientePrivilegio_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePrivilegio" ADD CONSTRAINT "ClientePrivilegio_privilegio_id_fkey" FOREIGN KEY ("privilegio_id") REFERENCES "Privilegio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
