import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
