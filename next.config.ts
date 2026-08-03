import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Baileys usa APIs nativas de Node (crypto, fs, sockets) y carga módulos de forma
  // dinámica; si Next lo empaqueta, la sesión de WhatsApp no arranca.
  serverExternalPackages: ['@prisma/client', 'bcryptjs', '@whiskeysockets/baileys'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
