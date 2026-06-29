import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';
import { nanoid } from 'nanoid';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No se recibió ninguna imagen' }, { status: 400 });
    }

    const ext = ALLOWED[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'Formato no permitido. Usa JPG, PNG, WEBP, GIF o AVIF.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'La imagen supera el máximo de 5 MB.' }, { status: 400 });
    }

    const filename = `${Date.now()}-${nanoid(8)}.${ext}`;

    // Producción (Vercel): si hay token de Blob, sube al almacenamiento de objetos.
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`productos/${filename}`, file, {
        access: 'public',
        contentType: file.type,
      });
      return NextResponse.json({ url: blob.url }, { status: 201 });
    }

    // Desarrollo local: guarda en public/uploads.
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    return NextResponse.json({ url: `/uploads/${filename}` }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
