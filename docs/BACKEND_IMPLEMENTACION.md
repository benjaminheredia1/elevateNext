# BACKEND — Arquitectura e implementación

> Stack: **Next.js 16 App Router (Route Handlers) + Prisma 7 + PostgreSQL + Zod**.
> Objetivo: una capa backend modular, segura y testeable para los nuevos módulos.

---

## 1. Arquitectura por capas

Aunque Next colapsa rutas y controlador, se separa la lógica en capas explícitas para
respetar SOLID y facilitar tests:

```
app/api/<modulo>/route.ts        → Controller (HTTP: parse, auth, status codes)
  └── lib/server/<modulo>/service.ts   → Service (reglas de negocio, transacciones)
        └── lib/server/<modulo>/repo.ts → Repository (acceso a datos vía Prisma)
  └── lib/server/dto/<modulo>.ts        → DTOs + validación (Zod)
  └── lib/server/auth/                  → autenticación + autorización (RBAC)
  └── lib/server/audit/                 → servicio de auditoría
  └── lib/server/errors.ts              → errores tipados + handler central
```

- **Controller:** sin lógica de negocio; solo orquesta (auth → validar DTO → llamar
  service → mapear resultado/errores a HTTP).
- **Service:** reglas de negocio, transacciones (`prisma.$transaction`), auditoría.
- **Repository:** queries Prisma reutilizables; sin reglas de negocio.
- **DTO:** contrato de entrada/salida validado con Zod; nunca exponer entidades crudas
  (no devolver `password`, hashes, etc.).

---

## 2. Estructura de carpetas propuesta

```
lib/server/
  auth/          requireAuth.ts, requireRole.ts, session.ts
  audit/         audit.service.ts
  errors.ts      AppError, NotFound, Forbidden, Conflict, Validation
  dto/           caja.dto.ts, finanzas.dto.ts, usuarios.dto.ts ...
  caja/          caja.service.ts, caja.repo.ts
  finanzas/      contabilidad.service.ts, flujo.service.ts ...
  usuarios/      usuarios.service.ts, usuarios.repo.ts
  ventas/        ventas.service.ts
app/api/
  caja/          apertura/route.ts, venta/route.ts, cierre/route.ts ...
  admin/         usuarios/route.ts, contabilidad/route.ts, auditoria/route.ts ...
```

---

## 3. Autenticación y autorización (RBAC)

- **Auth:** JWT custom existente (`lib/auth.ts`). El token incluye `userId` y `rol`.
- `requireAuth(req)` → valida JWT, carga `Usuario` (activo), devuelve sesión.
- `requireRole(roles[])(session)` → 403 si el rol no está permitido.
- **Patrón en cada handler:**
```ts
export async function POST(req: NextRequest) {
  const session = await requireAuth(req);          // 401 si falla
  requireRole(['CAJERO'])(session);                 // 403 si no permitido
  const dto = VentaFisicaDTO.parse(await req.json()); // 422 si inválido
  const result = await ventasService.registrarVentaFisica(session, dto);
  return NextResponse.json(result, { status: 201 });
}
```
- **Regla de oro:** autorización SIEMPRE en el servidor; el guard del cliente es solo
  UX. Verificar además **ownership** (que el recurso pertenezca al usuario/sucursal).

---

## 4. DTOs y validación (Zod)
- Un esquema por operación; inferir tipos con `z.infer`.
- Validar: tipos, rangos (montos ≥ 0, cantidades > 0), longitudes, enums.
- **Sanitización:** `.trim()` en strings; rechazar caracteres de control.
- Salida: DTO de respuesta que omite campos sensibles.

---

## 5. Manejo de errores
- Clases: `AppError(status, code, message)`, `NotFound`, `Forbidden`, `Conflict`,
  `ValidationError`.
- Handler central `toHttp(error)` mapea a `{ error, code }` + status.
- No filtrar stack traces ni mensajes internos al cliente; loguear el detalle server-side.

| Error | HTTP |
|-------|------|
| Validación (Zod) | 422 |
| No autenticado | 401 |
| Sin permiso | 403 |
| No encontrado | 404 |
| Conflicto de estado (turno) | 409 |
| Error interno | 500 |

---

## 6. Transacciones (operaciones críticas)
- Usar `prisma.$transaction(async (tx) => { ... })` para: venta física, cierre de
  caja, registro de movimiento + actualización de saldo, descuento de stock.
- Revalidar invariantes dentro de la transacción (ej. turno sigue ABIERTO).
- Recalcular montos en el servidor a partir de datos de BD (precios, recetas).

---

## 7. Auditoría (servicio transversal)
```ts
await auditService.log(tx, {
  usuario: session.user, accion: 'CIERRE_CAJA',
  entidad: 'CajaTurno', entidadId: turno.id,
  detalle: `Cierre con diferencia ${dif}`, monto: dif,
  ip: getIp(req), userAgent: req.headers.get('user-agent'),
});
```
- Se invoca dentro de la misma transacción que la mutación (consistencia).
- Ver `SEGURIDAD_Y_AUDITORIA.md` para qué acciones auditar.

---

## 8. Logs
- Log estructurado (JSON) server-side: nivel, requestId, userId, ruta, latencia.
- No loguear secretos ni PII innecesaria. Errores 5xx con stack en logs, no al cliente.

---

## 9. Endpoints por módulo (índice)

| Módulo | Base | Métodos clave |
|--------|------|---------------|
| Caja (cajero) | `/api/caja/*` | apertura, venta, ingreso, gasto, movimientos, cierre, historial |
| Usuarios | `/api/admin/usuarios` | GET, POST, PUT, DELETE(soft) |
| Auditoría | `/api/admin/auditoria` | GET (filtros) |
| Contabilidad | `/api/admin/contabilidad/*` | estado-resultados, balance |
| Flujo de caja | `/api/admin/flujo-caja` | GET |
| Gastos fijos | `/api/admin/gastos-fijos` | CRUD |
| Activos fijos | `/api/admin/activos-fijos` | CRUD |
| Cuentas C/P | `/api/admin/cuentas-corrientes` | GET, POST, PUT(pago) |
| Clientes | `/api/admin/clientes` | GET, GET/:id |
| Dashboard | `/api/admin/dashboard` | GET |

> Endpoints existentes (`/api/pedidos`, `/api/productos`, `/api/insumo`, etc.) se
> **conservan**; se les añade verificación de rol donde falte.

---

## 10. Tests recomendados
- **Unitarios (services):** cálculo de esperado de caja, diferencias, costo de
  receta, descuento de stock en cascada, reglas de autorización.
- **Integración (API):** apertura/venta/cierre felices + casos de error (409/422/403).
- **Transaccionales:** rollback ante fallo parcial (venta que falla a mitad).
- **Seguridad:** un CAJERO no accede a `/api/admin/*`; ownership cross-sucursal.
- **Redondeo de dinero:** propiedades con montos decimales.
- Herramientas sugeridas: Vitest + supertest (o test runners de Next) + BD de prueba.

---

## 11. Buenas prácticas
- Servicios puros y testeables (inyección de `tx`/repos).
- Nombres claros (`registrarVentaFisica`, `cerrarTurno`).
- Sin lógica de negocio en componentes ni en route handlers.
- Idempotencia donde aplique (claves de idempotencia en apertura/cierre).
- Versionado de API si se expone a terceros (futuro).
