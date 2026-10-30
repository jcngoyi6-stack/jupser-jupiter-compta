import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Jupiter Compta',
  description: "ERP de gestion d'entreprise conforme au SYSCOHADA révisé — édité par JUPSER",
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.ico', apple: '/brand/icone_Jupiter_Compta_180.png' },
};
export const viewport: Viewport = { themeColor: '#0D2747' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
