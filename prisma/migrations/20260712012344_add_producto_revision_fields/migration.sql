-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "en_revision" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "insumo_causa_revision_id" INTEGER,
ADD COLUMN     "motivo_revision" TEXT,
ADD COLUMN     "revision_desde" TIMESTAMP(3);
