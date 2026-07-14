import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/server/email/resend';
import { buildPasswordResetEmailHtml } from '@/lib/server/email/password-reset-email';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const SALT_ROUNDS = Number(process.env.SALT_ROUNDS ?? 10);

function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** Solicita restablecimiento. Siempre resuelve sin revelar si el email existe. */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;

  const user = await prisma.usuario.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, nombre: true, activo: true },
  });

  if (!user || !user.activo) return;

  const token = nanoid(48);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  // Crear token primero; los anteriores siguen válidos hasta confirmar el envío del correo.
  await prisma.passwordResetToken.create({
    data: { token, usuario_id: user.id, expires_at: expiresAt },
  });

  const resetUrl = `${getAppBaseUrl()}/login/restablecer-contrasena?token=${encodeURIComponent(token)}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Restablece tu contraseña — Elevate',
      html: buildPasswordResetEmailHtml({
        nombre: user.nombre,
        resetUrl,
        expiresMinutes: RESET_TOKEN_TTL_MS / 60000,
      }),
    });
  } catch (error) {
    await prisma.passwordResetToken.delete({ where: { token } }).catch(() => {});
    throw error;
  }

  // Solo invalidar enlaces anteriores cuando el correo nuevo se envió correctamente.
  await prisma.passwordResetToken.updateMany({
    where: {
      usuario_id: user.id,
      used_at: null,
      NOT: { token },
    },
    data: { used_at: new Date() },
  });
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const trimmedToken = token.trim();
  if (!trimmedToken) throw new Error('Token inválido');
  if (newPassword.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: trimmedToken },
    include: { usuario: { select: { id: true, activo: true } } },
  });

  if (!record || record.used_at || record.expires_at < new Date()) {
    throw new Error('El enlace de restablecimiento es inválido o expiró');
  }
  if (!record.usuario.activo) throw new Error('Usuario inactivo');

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: record.usuario_id },
      data: { password: passwordHash, token: '' },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { used_at: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { usuario_id: record.usuario_id, used_at: null },
      data: { used_at: new Date() },
    }),
  ]);
}
