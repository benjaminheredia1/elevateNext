import { NextRequest, NextResponse } from 'next/server';
import { validateToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token) return NextResponse.json({ message: 'Token requerido' }, { status: 400 });
    const valid = await validateToken(token);
    if (valid) {
      return NextResponse.json({ status: 200 }, { status: 200 });
    } else {
      return NextResponse.json({ status: 401 }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ status: 401 }, { status: 401 });
  }
}
