import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from './prisma';
import type { Rol } from '@prisma/client';

const SECRET_JWT = process.env.SECRET_JWT!;
const SALT_ROUNDS = Number(process.env.SALT_ROUNDS ?? 10);

export interface TokenPayload {
  sub: string;     // id del usuario
  email: string;
  rol: Rol;
}

function signToken(user: { id: number; email: string; rol: Rol }): string {
  const payload: TokenPayload = { sub: String(user.id), email: user.email, rol: user.rol };
  return jwt.sign(payload, SECRET_JWT, { expiresIn: '1200m' });
}

export async function register(
  email: string,
  password: string,
  apellido_paterno: string,
  apellido_materno: string,
  nombre: string,
) {
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.usuario.create({
    data: { email, password: password_hash, apellido_paterno, apellido_materno, nombre, token: '' },
  });
  const access_token = signToken(user);
  await prisma.usuario.update({ where: { id: user.id }, data: { token: access_token } });
  const { password: _omit, ...safeUser } = user;
  return { access_token, user: { ...safeUser, token: access_token } };
}

export async function login(identifier: string, password: string) {
  const id = identifier.trim();
  const user = await prisma.usuario.findFirst({
    where: { OR: [{ email: id }, { username: id }] },
  });
  // Mensaje único: no revelar si el usuario existe, está inactivo o falló la clave
  if (!user || !user.activo) throw new Error('Credenciales inválidas');
  const password_valid = await bcrypt.compare(password, user.password);
  if (!password_valid) throw new Error('Credenciales inválidas');

  const access_token = signToken(user);
  await prisma.usuario.update({
    where: { id: user.id },
    data: { token: access_token, ultimo_acceso: new Date() },
  });
  const { password: _omit, ...safeUser } = user;
  return { access_token, user: { ...safeUser, token: access_token } };
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, SECRET_JWT) as TokenPayload;
  } catch {
    return null;
  }
}

export async function validateToken(token: string): Promise<boolean> {
  const payload = verifyToken(token);
  if (!payload) return false;
  const user = await prisma.usuario.findUnique({ where: { id: Number(payload.sub) } });
  return !!user && user.activo;
}
