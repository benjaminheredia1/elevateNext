# =============================================================================
# Elevate — imagen de producción
#
# Ojo con esta app: la sesión de WhatsApp (Baileys) vive DENTRO del proceso de
# Next, así que el contenedor tiene que ser un proceso persistente (no
# serverless) y necesita un volumen para no perder el pareo del QR en cada
# reinicio. Ver WHATSAPP_AUTH_DIR más abajo.
#
# Debian slim en vez de Alpine: Baileys y sus dependencias opcionales dan
# problemas con musl, y el ahorro de tamaño no compensa el riesgo.
# =============================================================================

# --- Dependencias -----------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app

# Por si alguna dependencia opcional necesita compilarse; queda solo en esta
# etapa, la imagen final no lleva compiladores.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# `npm ci` con todas las deps: `prisma` (el CLI) es devDependency y hace falta
# para generar el cliente en la etapa siguiente.
RUN npm ci


# --- Build ------------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `prisma.config.ts` exige DATABASE_URL apenas se carga, y la imagen no lleva
# `.env` (bien excluido en .dockerignore). Este valor es un relleno de build:
# `prisma generate` no se conecta a ninguna base, y esta ENV muere con la etapa
# — la imagen final recibe la URL real por env_file en tiempo de ejecución.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

# El generate va antes del build: `next build` importa @prisma/client.
# Prisma 7 usa driver adapter + query compiler WASM, así que lo generado es
# portable y no depende de la plataforma.
RUN npx prisma generate && npm run build


# --- Runtime ----------------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    # Carpeta de la sesión de WhatsApp. DEBE ser un volumen: si se pierde,
    # hay que volver a escanear el QR desde /admin/whatsapp.
    WHATSAPP_AUTH_DIR=/data/whatsapp-auth

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /data/whatsapp-auth \
    && chown -R nextjs:nodejs /data

# `output: 'standalone'` deja en .next/standalone el server con solo las
# dependencias que traza. static/ y public/ van aparte, por diseño de Next.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Seguro contra un agujero conocido: el trazado de Next a veces se saltea los
# .wasm del cliente de Prisma. Copiarlo explícito evita un fallo en runtime que
# solo aparecería con la primera query.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
VOLUME ["/data/whatsapp-auth"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
