import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { hasRole, type User } from "@/lib/auth"
import { GUARD_SESSION_COOKIE } from "@/lib/guard-session.constants"
import { verifyGuardSessionCookieEdge } from "@/lib/guard-session.edge"

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.REPORT_ACCESS_SECRET?.trim() ||
    "development-only-guard-session-secret-min-16-chars!!"
  )
}

function payloadToUser(p: { sub: string; role: string; ar?: User["additionalRoles"] }): User {
  return {
    username: p.sub,
    role: p.role as User["role"],
    additionalRoles: p.ar,
  }
}

export async function middleware(request: NextRequest) {
  const cookie = request.cookies.get(GUARD_SESSION_COOKIE)?.value
  if (!cookie) {
    const url = new URL("/login", request.url)
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  const payload = await verifyGuardSessionCookieEdge(cookie, getSessionSecret())
  if (!payload) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const u = payloadToUser({
    sub: payload.sub,
    role: String(payload.role),
    ar: payload.ar,
  })

  if (!hasRole(u, "admin") && !hasRole(u, "superadmin")) {
    return NextResponse.redirect(new URL("/check", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
}
