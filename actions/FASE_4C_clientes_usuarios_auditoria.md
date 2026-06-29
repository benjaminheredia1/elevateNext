# FASE 4 · C — Clientes (vista admin) + Usuarios (gestión) + Auditoría (UI)

> Depende de Fase 0. Rol DUENO/ADMIN (gestión de roles altos: solo DUENO).
> Ref: `docs/MODULO_ADMINISTRADOR.md` §3.2, §3.9, §3.10; `docs/SEGURIDAD_Y_AUDITORIA.md`.

## Parte 1 — Clientes (vista admin)
- Backend `GET /api/admin/clientes` (lista + métricas) y `GET /api/admin/clientes/[id]`.
  Agregar sobre `Cliente` + `Transaccion`: total clientes, ingresos totales, gasto
  promedio; por cliente: primer pedido, # pedidos, total gastado.
- Front `app/admin/clientes/page.tsx`: KpiCards (Total clientes, Ingresos, Gasto
  promedio [destacado]); tabla (cliente+teléfono, primer pedido, # pedidos, total
  gastado); búsqueda; export Excel.

## Parte 2 — Usuarios (gestión + roles)
- Backend `GET/POST/PUT/DELETE /api/admin/usuarios`:
  - **Autorización estricta:** solo `DUENO` puede crear/editar usuarios con rol
    `ADMIN`/`DUENO`; `ADMIN` solo gestiona `CAJERO`. Validar en el servidor.
  - Password hasheado (bcrypt); NUNCA devolver el hash.
  - DELETE = soft (`activo:false`). Crear interno con `activo:true` (ver regla en
    `docs/MODULO_ADMINISTRADOR.md` §3.9 — reactivar es acción explícita, no upsert).
  - Asignar `sucursal_id` a cajeros. Auditar create/update/delete y cambios de rol.
- Front `app/admin/usuarios/page.tsx`: contadores por rol; tabla (usuario, nombre,
  rol [badge]); modal alta/edición con selector de rol (deshabilitar roles que el
  usuario actual no puede asignar); toggle activo; asignar sucursal a cajeros.

## Parte 3 — Auditoría (UI)
- Backend `GET /api/admin/auditoria?rol=&q=&rango=` → lista paginada de
  `RegistroAuditoria` (join con usuario para nombre). Rol DUENO/ADMIN.
- Front `app/admin/auditoria/page.tsx`: tabla (fecha, usuario+rol, acción, detalle,
  monto); filtros por rol (Todos/Admin/Cajero/Dueño) + búsqueda. **Solo lectura**
  (append-only). `EmptyState`.

## Sidebar
Agregar al grupo **ADMINISTRACIÓN**: Usuarios, Auditoría (y Clientes al grupo
CLIENTES). Completa la navegación de la referencia "Paladar".

## Criterios de aceptación
- [ ] Solo DUENO gestiona ADMIN/DUENO; ADMIN solo CAJERO (probar 403).
- [ ] Hash de password nunca expuesto en respuestas.
- [ ] Auditoría visible con filtros; inmutable (sin editar/borrar desde UI).
- [ ] Clientes muestra métricas correctas.

> Con esto **cierra la Fase 4** (administración general completa).
