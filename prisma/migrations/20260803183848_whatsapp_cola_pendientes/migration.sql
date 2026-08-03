-- CreateEnum
CREATE TYPE "EstadoMensajeWhatsapp" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "WhatsappPendiente" (
    "id" SERIAL NOT NULL,
    "jid" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "estado" "EstadoMensajeWhatsapp" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_at" TIMESTAMP(3),

    CONSTRAINT "WhatsappPendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappPendiente_estado_created_at_idx" ON "WhatsappPendiente"("estado", "created_at");
