-- AlterTable
ALTER TABLE "ConfiguracionAlertas" ALTER COLUMN "plantilla_mensaje" SET DEFAULT 'Elevate - Alerta de inventario: {count} insumos bajo umbral.
{list}';

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" SERIAL NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);
