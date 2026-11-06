import { jwtVerify } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';

// Keeps signed-out visitors on the login page. Public guest-pass pages (/p/...)
// and the API (which checks sessions itself) stay open.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/login') || path.startsWith('/p/') || path.startsWith('/api/')) return NextResponse.next();

  const token = request.cookies.get('sn_session')?.value;
  let signedIn = false;
  if (token && process.env.SESSION_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET), { audience: 'session' });
      signedIn = true;
    } catch {}
  }
  if (!signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
