import type { Metadata } from 'next';
import { Providers } from '@/lib/providers';
import './globals.css';
import './App.css';

export const metadata: Metadata = {
  title: 'Elevate — Beyond Performance | Comida Saludable Santa Cruz',
  description:
    'Catering de comida saludable premium en Santa Cruz de la Sierra, Bolivia. Bowls, wraps, smoothies y más. Entrega rápida a domicilio.',
  keywords: 'comida saludable, Santa Cruz, Bolivia, delivery, bowls, proteína, Elevate',
  openGraph: {
    title: 'Elevate — Beyond Performance',
    description: 'Alimentación que eleva tu rendimiento. Santa Cruz, Bolivia.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
