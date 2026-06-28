# Elevate Delivery - Contexto del Proyecto para Claude Code

## Descripción General
Este es un sistema de pedidos y delivery ("Elevate") construido en **Next.js (App Router)**. Permite gestionar productos, insumos, inventarios, y realizar un seguimiento en tiempo real de los repartidores.

## Stack Tecnológico
- **Framework:** Next.js 16+ con Turbopack (App Router).
- **Base de Datos:** PostgreSQL.
- **ORM:** Prisma (`prisma/schema.prisma`).
- **Autenticación:** Sistema propio basado en JWT (`lib/auth.ts`) con tokens que expiran en 1200 minutos.
- **Estilos y UI:** React (Framer Motion para animaciones), componentes personalizados.
- **Mapas:** Leaflet para el renderizado de mapas del administrador y repartidores.

## Módulos Principales
### 1. Panel de Administrador (`/admin`)
- **Dashboard:** Vistas de estadísticas.
- **Pedidos (`AdminOrders.tsx`):** Gestión de transacciones y estados (`PENDIENTE`, `EN_PREPARACION`, `EN_CAMINO`, `ENTREGADO`, `CANCELADO`).
- **Deliverys (`AdminDeliverys.tsx`):** Mapa global donde el admin puede ver en tiempo real a todos los repartidores activos.
- **Configuración (`/admin/settings`):** Establece la ubicación global (Lat/Lng) de la sucursal o restaurante principal usando el modelo `Configuracion`.

### 2. Vista de Repartidor (`/driver/[token]`)
- Cuando un pedido se despacha, se genera un enlace único para el repartidor.
- La vista del repartidor incluye un mapa que muestra:
  - 🏢 El restaurante (recogida).
  - 🏠 El cliente (entrega).
  - 🚙 La posición GPS en vivo del repartidor.
- El GPS envía la latitud/longitud del repartidor al servidor constantemente (vía `PUT /api/pedidos/driver/[token]`).

### 3. API
- `/api/auth/login`: Endpoint para el login de administrador.
- `/api/pedidos`: Creación y actualización de transacciones.
- `/api/pedidos/driver/[token]`: Obtención de datos públicos del pedido para el repartidor y actualización de su GPS en vivo.
- `/api/configuracion`: Obtención y guardado de la latitud/longitud de la sucursal.

## Notas Técnicas para Claude
- **Caché agresivo:** Durante el desarrollo, Turbopack puede cachear el cliente de Prisma u otras rutas fuertemente. Ante errores de "propiedad undefined" en el backend tras migraciones, asegúrate de pedirle al usuario que limpie `.next` o reinicie el servidor.
- **Prisma Singleton:** Prisma se instancia globalmente en `lib/prisma.ts`.
- **Botón de Simulación:** Hay un botón en el panel de administrador diseñado para inyectar pedidos de prueba rápidamente y simular flujos de delivery.

## Ejecución del Proyecto (Base de Datos)
Para que el entorno funcione correctamente o después de hacer cambios en el esquema de Prisma (`prisma/schema.prisma`), el agente debe saber cómo ejecutar los comandos de Prisma:

1. **Migrar o empujar los cambios a la base de datos:**
   ```bash
   npx prisma db push --accept-data-loss
   npx prisma generate
   ```
2. **Sembrar la base de datos (Seed):**
   ```bash
   npx prisma db seed
   ```
   *(Si da problemas en Windows por permisos de ejecución, se puede ejecutar `node --import tsx prisma/seed.ts` o asegurarse de usar el intérprete correcto).*
