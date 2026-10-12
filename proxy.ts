import { NextResponse, type NextRequest } from "next/server"

// Écrans accessibles sans session : connexion et vérification MFA.
// La réinitialisation d'un mot de passe ne se fait plus en libre-service :
// l'employé passe au bureau du responsable système, qui génère le nouveau
// mot de passe depuis la section « Update password ».
const AUTH_ROUTES = ["/login", "/verify"]

/**
 * Préfixe de la section réservée à l'admin de plateforme.
 * Ces pages sont en plus verrouillées côté API (requireAccess('admin')) et par
 * AdminGuard, qui relit le rôle sur /user/api/me. Le proxy ne connaît que le
 * cookie : il peut donc seulement garantir qu'aucun visiteur non connecté
 * n'atteint ces écrans, pas valider le rôle lui-même.
 */
const ADMIN_PREFIX = "/admin"

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.includes(pathname)
}

function isAdminRoute(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = Boolean(request.cookies.get("nexolia_token")?.value)

  // Session déjà ouverte : on ne laisse pas repasser par les écrans de connexion
  if (hasSession && isAuthRoute(pathname)) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Sans session, tout écran protégé (dont /admin et les pages métier) renvoie
  // vers la connexion. Les écrans de connexion sont exclus, sinon ils se
  // redirigeraient eux-mêmes en boucle.
  if (!hasSession && !isAuthRoute(pathname)) {
    const target = new URL("/login", request.url)
    // On memorise la page demandee pour y revenir apres authentification
    if (pathname !== "/") {
      target.searchParams.set("from", pathname)
    }
    return NextResponse.redirect(target)
  }

  // L'administration plateforme ne doit jamais etre servie depuis un cache
  // partage : ces pages dependent du role et du contenu de la base.
  if (isAdminRoute(pathname)) {
    const response = NextResponse.next()
    response.headers.set("Cache-Control", "private, no-store, max-age=0")
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[\\w]+$).*)",
  ],
}