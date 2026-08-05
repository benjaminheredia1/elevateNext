-- Menús administrables.
--
-- `Marca` pasa a ser la carta pública editable desde el admin. Todo lo que se
-- agrega acá vivía hardcodeado en data/menus.ts y en el array `collaborations`
-- de app/page.tsx, así que sin esto no se puede crear un menú nuevo sin tocar
-- código. Es aditivo: ninguna columna existente cambia de tipo ni se borra.

-- Estado y orden. PUBLICADO por defecto para que las cartas que ya están al
-- aire sigan al aire después de aplicar la migración.
ALTER TABLE "Marca" ADD COLUMN "estado" "EstadoPublicacion" NOT NULL DEFAULT 'PUBLICADO';
ALTER TABLE "Marca" ADD COLUMN "orden" INTEGER NOT NULL DEFAULT 0;

-- Presentación.
ALTER TABLE "Marca" ADD COLUMN "eyebrow" TEXT;
ALTER TABLE "Marca" ADD COLUMN "kicker" TEXT;
ALTER TABLE "Marca" ADD COLUMN "titulo" TEXT;
ALTER TABLE "Marca" ADD COLUMN "tagline" TEXT;
ALTER TABLE "Marca" ADD COLUMN "descripcion" TEXT;
ALTER TABLE "Marca" ADD COLUMN "bullets" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Marca" ADD COLUMN "cta_texto" TEXT;
ALTER TABLE "Marca" ADD COLUMN "icono" TEXT;
ALTER TABLE "Marca" ADD COLUMN "imagen_url" TEXT;

-- `slug` es requerido y único, y la tabla ya tiene filas: se agrega nullable,
-- se rellena con `key` (que es lo que hoy va en la URL /menu/<key>) y solo
-- entonces se marca NOT NULL.
ALTER TABLE "Marca" ADD COLUMN "slug" TEXT;
UPDATE "Marca" SET "slug" = "key" WHERE "slug" IS NULL;
ALTER TABLE "Marca" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Marca_slug_key" ON "Marca"("slug");

CREATE INDEX "Marca_estado_orden_idx" ON "Marca"("estado", "orden");

-- Copia de los textos que hoy están en el código, para que la landing y las
-- páginas de menú se vean exactamente igual una vez que lean de la base.
UPDATE "Marca" SET
  "orden"       = 1,
  "eyebrow"     = 'Colaboración',
  "kicker"      = 'Colaboración oficial',
  "titulo"      = 'Elevate × Fitbull',
  "tagline"     = 'Nutrición deportiva de alto rendimiento, lista para tu entreno.',
  "descripcion" = 'Nos aliamos con Fitbull, el gimnasio que entrena a la comunidad fitness de Santa Cruz, para crear un menú pensado para tu rendimiento. Pre-entreno, recovery y alto en proteína: cada plato apoya tus objetivos dentro y fuera del gym.',
  "bullets"     = ARRAY['Recetas aprobadas por entrenadores', 'Macros calculados por porción', 'Ideal pre y post entreno'],
  "cta_texto"   = 'Menú Elevate × Fitbull',
  "icono"       = 'dumbbell'
WHERE "key" = 'fitbull';

UPDATE "Marca" SET
  "orden"       = 2,
  "eyebrow"     = 'Nuestra casa',
  "kicker"      = 'Nuestra casa',
  "titulo"      = 'Catering Elevate',
  "tagline"     = 'Comida saludable, fresca y deliciosa para cada momento del día.',
  "descripcion" = 'El corazón de Elevate: nuestro catering de comida saludable. Bowls, ensaladas, wraps y bebidas frescas preparadas cada día con ingredientes locales. Comida que disfrutas sin culpa, para cualquier momento del día.',
  "bullets"     = ARRAY['Hecho fresco cada día', 'Ingredientes locales bolivianos', 'Opciones para todos los gustos'],
  "cta_texto"   = 'Menú Elevate',
  "icono"       = 'bowl'
WHERE "key" = 'elevate';
