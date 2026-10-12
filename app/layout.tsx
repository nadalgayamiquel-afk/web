import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Top Play Training | Centro de Control',
  description: 'Plataforma de planificación y rendimiento — Top Play Training',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">

          

      <body>
          
          

{children}</body>
    </html>
  );
}
