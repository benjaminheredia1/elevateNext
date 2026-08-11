import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/server/auth/session';

export async function GET(req: NextRequest) {
  try {
    const s = await requireAuth(req);
    // `sucursales` alimenta el selector del panel: solo ofrece las propias.
    return NextResponse.json({ id: s.id, nombre: s.nombre, rol: s.rol, sucursal_id: s.sucursal_id, sucursales: s.sucursales });
  } catch (e) {
    const status = e instanceof AuthError ? 401 : 500;
    return NextResponse.json({ message: 'No autenticado' }, { status });
  }
}
