import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from './prisma';

const SECRET_JWT = process.env.SECRET_JWT!;
const SALT_ROUNDS = Number(process.env.SALT_ROUNDS ?? 10);

export async function register(
  email: string,
  password: string,
  apellido_paterno: string,
  apellido_materno: string,
  nombre: string
) {
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const payload = { email, password };
  const access_token = jwt.sign(payload, SECRET_JWT, { expiresIn: '1200m' });

  const user = await prisma.usuario.create({
    data: {
      email,
      password: password_hash,
      apellido_paterno,
      apellido_materno,
      nombre,
      token: access_token,
    },
  });

  return { access_token, user };
}

export async function login(email: string, password: string) {
  const user = await prisma.usuario.findFirst({ where: { email } });
  if (!user) throw new Error('Usuario no encontrado');

  const password_valid = await bcrypt.compare(password, user.password);
  if (!password_valid) throw new Error('Contraseña incorrecta');

  const payload = { email, password };
  const access_token = jwt.sign(payload, SECRET_JWT, { expiresIn: '1200m' });

  await prisma.usuario.updateMany({
    where: { id: user.id },
    data: { token: access_token },
  });

  return { access_token, user };
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    jwt.verify(token, SECRET_JWT);
    const user = await prisma.usuario.findFirst({ where: { token } });
    return !!user;
  } catch {
    return false;
  }
}
