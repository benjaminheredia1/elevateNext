-- AlterTable
ALTER TABLE "ActivoFijo" ADD COLUMN     "metodo_pago" "TipoCuenta" NOT NULL DEFAULT 'EFECTIVO',
ADD COLUMN     "vida_util_anios" INTEGER;
