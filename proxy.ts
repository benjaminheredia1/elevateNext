import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Este repo quedó retirado: desde 2026-09-29 se opera en el sistema nuevo (Supabase).
// Se bloquea todo el sitio para que nadie siga vendiendo ni haciendo pedidos sobre
// la BD vieja. La API se corta también: una pestaña de caja que quedó abierta con
// sesión podría seguir escribiendo aunque la pantalla no se viera.
const RUTA_AVISO = '/fuera-de-servicio';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ message: 'Sistema fuera de servicio' }, { status: 503 });
  }

  if (pathname === RUTA_AVISO) return NextResponse.next();

  return NextResponse.rewrite(new URL(RUTA_AVISO, request.url));
}

export const config = {
  // Se excluyen solo los estáticos, para que la pantalla de aviso cargue sus estilos.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)'],
};
