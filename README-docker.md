# Desplegar Elevate con Docker

La sesión de WhatsApp (Baileys) corre **dentro del proceso de Next**. Eso obliga
a dos cosas:

1. El contenedor tiene que estar siempre encendido (no sirve serverless/Vercel).
2. `/data/whatsapp-auth` **debe** ser un volumen. Si se pierde, hay que volver a
   escanear el QR desde `/admin/whatsapp`.

## Primer despliegue

1. Crear `.env.produccion` al lado del `docker-compose.prod.yml` (no se commitea):

```env
DATABASE_URL=postgresql://usuario:clave@host:5432/elevate
DIRECT_URL=postgresql://usuario:clave@host:5432/elevate
SECRET_JWT=<secreto largo y aleatorio>
SALT_ROUNDS=10
NEXT_PUBLIC_APP_URL=https://tu-dominio
NEXT_PUBLIC_API_URL=https://tu-dominio
```

2. Aplicar las migraciones **desde fuera del contenedor** (la imagen no trae el
   CLI de Prisma a propósito: la base es compartida y migrar no debe pasar solo
   al arrancar):

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

3. Levantar:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

4. Entrar a `https://tu-dominio/admin/whatsapp`, conectar y escanear el QR una
   vez. La sesión queda en el volumen y sobrevive a los reinicios.

## Operación

```bash
docker compose -f docker-compose.prod.yml logs -f app     # ver logs
docker compose -f docker-compose.prod.yml up -d --build   # desplegar cambios
docker compose -f docker-compose.prod.yml restart app     # reiniciar
```

Tras un reinicio, la sesión de WhatsApp se reconecta sola y los avisos que
hayan quedado encolados salen apenas vuelve la conexión.

## Cosas que conviene saber

- **Backup del pareo**: `docker run --rm -v elevatenextjs_whatsapp_auth:/data -v $(pwd):/backup alpine tar czf /backup/whatsapp-auth.tgz -C /data .`
- **Cerrar sesión de WhatsApp** desde el panel borra el contenido del volumen;
  para volver a usarlo hay que escanear el QR otra vez.
- La imagen corre como usuario no-root (`nextjs`, uid 1001).
- El healthcheck pega a `/` cada 30s; `docker ps` muestra `(healthy)`.
- Si ponés un reverse proxy (nginx/Caddy) delante, acordate de pasar
  `X-Forwarded-Proto` para que las cookies `secure` de sesión funcionen.
