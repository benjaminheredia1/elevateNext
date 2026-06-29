# SEGURIDAD Y AUDITORÍA

> Controles de seguridad y trazabilidad para el sistema, con foco en las
> **operaciones críticas de caja y dinero**.

---

## 1. Modelo de roles y permisos

| Rol | Alcance |
|-----|---------|
| **DUENO** | Todo, incluida gestión de usuarios/roles y configuración sensible |
| **ADMIN** | Operación + finanzas + administración; NO gestiona dueños |
| **CAJERO** | Solo `/caja/*` de su sucursal; sin acceso a admin |
| **CLIENTE** | Tienda + su propio flujo de pedidos |

- Permisos basados en rol (RBAC). Si se requiere granularidad futura, evolucionar a
  permisos por acción (`caja:cerrar`, `usuarios:crear`).
- **Principio de menor privilegio:** cada endpoint declara el conjunto mínimo de
  roles permitidos.

---

## 2. Autenticación
- JWT custom (existente) firmado con `SECRET_JWT` (secreto fuerte, solo en servidor).
- Token con expiración; incluir `rol` y `sucursal_id` en el payload.
- Contraseñas con **bcrypt** (`SALT_ROUNDS` configurable). Nunca almacenar/loggear en
  claro ni devolver el hash.
- Logout invalida el token del lado cliente; considerar lista de revocación si se
  requiere invalidación server-side.
- Recomendado: almacenar el token en cookie `HttpOnly` + `Secure` + `SameSite=Lax`
  (mejor que localStorage para mitigar XSS-robo de token).

---

## 3. Autorización
- **Server-side obligatoria** en cada Route Handler (`requireRole`).
- **Ownership:** validar que el recurso pertenece al usuario/sucursal (no confiar en
  IDs del cliente). Ej.: un cajero solo cierra SU turno abierto.
- El guard del frontend es solo UX, nunca la única barrera.

---

## 4. Protección de endpoints
- Validar método HTTP y `Content-Type`.
- Validar y sanitizar **toda** entrada con Zod (tipos, rangos, enums, longitudes).
- Responder con códigos correctos (401/403/404/409/422) sin filtrar internals.

---

## 5. Prevención de vulnerabilidades

| Riesgo | Control |
|--------|---------|
| **SQL Injection** | Prisma (consultas parametrizadas). Evitar `$queryRawUnsafe`; si se usa raw, parametrizar siempre |
| **XSS** | React escapa por defecto; evitar `dangerouslySetInnerHTML`; sanitizar entradas mostradas |
| **CSRF** | Si se usan cookies de sesión: token CSRF o `SameSite`. Con Bearer en header el riesgo baja |
| **IDOR** | Checks de ownership en cada acceso por ID |
| **Mass assignment** | DTOs explícitos; nunca `data: req.body` directo a Prisma |
| **Rate abuse** | Rate limiting en login, venta, cierre, registro |
| **Secrets leak** | Secretos solo en env server; nunca en `NEXT_PUBLIC_*` |

---

## 6. Rate limiting
- Login: limitar intentos por IP/usuario (mitiga fuerza bruta).
- Endpoints de caja/venta/cierre: limitar ráfagas (evita doble cobro/doble cierre).
- Implementación: middleware con almacén (Vercel KV/Upstash Redis) o limitador en
  memoria por instancia (mínimo).

---

## 7. Protección de datos sensibles
- PII de clientes (teléfono, dirección): acceso solo por roles autorizados; no
  exponer en respuestas públicas.
- No loguear contraseñas, tokens ni montos asociados a PII innecesariamente.
- Backups de BD cifrados (responsabilidad del proveedor gestionado).

---

## 8. Control de sesiones
- Expiración razonable + refresh controlado.
- `ultimo_acceso` para detectar inactividad.
- Cierre de sesión limpia credenciales del cliente.

---

## 9. Seguridad en operaciones críticas (caja/dinero)

### 9.1 Reglas anti-manipulación de montos
- **El servidor recalcula** el total de toda venta desde los precios de BD y las
  cantidades; **ignora** cualquier total enviado por el cliente.
- El **esperado de caja** se calcula en el servidor a partir de movimientos
  persistidos; el cliente solo aporta el conteo **real**.
- Movimientos de caja **inmutables**: correcciones solo vía `AJUSTE` (con motivo y
  auditoría), nunca editando registros previos.

### 9.2 Atomicidad
- Venta y cierre dentro de `prisma.$transaction`; revalidar invariantes (turno
  ABIERTO, stock) dentro de la transacción. Rollback total ante fallo.

### 9.3 Doble operación
- Idempotencia en apertura/cierre/venta (clave de idempotencia o lock optimista por
  estado) para evitar doble submit/doble cobro.

### 9.4 Segregación de funciones
- El cajero opera caja; el ajuste/edición supervisada de cierres queda a ADMIN/DUENO,
  siempre auditado.

---

## 10. Auditoría (trazabilidad)

### 10.1 Qué se audita (mínimo)
- Login/Logout; apertura y cierre de caja (con diferencia); cada venta, ingreso,
  egreso, ajuste, retiro; creación/edición/baja de usuarios y cambios de rol; cambios
  de precios/productos; cambios de configuración; pagos de cuentas por cobrar/pagar.

### 10.2 Qué se registra
`usuario_id`, `rol`, `accion`, `entidad`, `entidad_id`, `detalle`, `monto?`, `ip`,
`user_agent`, `created_at`. Tabla `RegistroAuditoria` (ver `BASE_DE_DATOS.md` §5).

### 10.3 Propiedades
- **Inmutable** (append-only): sin update/delete desde la app.
- Escrita en la **misma transacción** que la mutación (consistencia).
- Consultable por el admin con filtros (rol, usuario, rango, entidad).
- Retención adecuada; export para respaldo.

---

## 11. Cumplimiento / buenas prácticas
- Variables de entorno fuera del repo; rotación de secretos.
- Dependencias actualizadas (auditoría de vulnerabilidades).
- HTTPS en producción (Vercel por defecto).
- Revisión de seguridad antes de cada release de módulos de dinero.

---

## 12. Checklist de aceptación de seguridad
- [ ] Cada endpoint valida rol y ownership en el servidor.
- [ ] Totales de venta calculados en servidor; cliente no puede alterar montos.
- [ ] Cierre de caja atómico, idempotente y auditado.
- [ ] Auditoría inmutable cubre todas las acciones del §10.1.
- [ ] Sin secretos en el bundle del cliente.
- [ ] Rate limiting en login y operaciones de caja.
