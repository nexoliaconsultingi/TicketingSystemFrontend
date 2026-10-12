import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { NotificationSound } from '@/components/realtime/notification-sound'
import { NotificationsGate } from '@/components/realtime/notifications-gate'
import { UnseenBadgesGate } from '@/components/realtime/unseen-badges-gate'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Nexolia · Service Operations',
    template: '%s',
  },
  description:
    "Service and ticket management platform for international organisations.",
  generator: 'Nexolia Service Desk',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7f9fc',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <UnseenBadgesGate>
          {/* Les notifications du compte vivent à la racine : la cloche est
              dans l'en-tête de chaque écran, et son écoute temps réel doit
              rester ouverte d'une page à l'autre. */}
          <NotificationsGate>{children}</NotificationsGate>
        </UnseenBadgesGate>
        {/* Écouteur, rien à afficher : placé à la racine pour survivre aux
            navigations et n'être abonné qu'une fois à la session. */}
        <NotificationSound />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
