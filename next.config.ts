import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empaqueta el servidor con solo las dependencias que realmente usa, para
  // que la imagen de Docker no arrastre todo node_modules. No afecta a
  // `next dev` ni a `next start` fuera de Docker.
  output: 'standalone',
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
