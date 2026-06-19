import { NextResponse, type NextRequest } from 'next/server';

function isTokenExpired(token: string): boolean {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return true;
        
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payloadJson = atob(payloadBase64);
        const payload = JSON.parse(payloadJson);
        
        if (!payload.exp) return true;
        
        const now = Math.floor(Date.now() / 1000);
        return payload.exp < now;
    } catch {
        return true;
    }
}

export function middleware(request: NextRequest) {
    // Ambil data cookie tanda login aktif dari browser
    let token = request.cookies.get('sb-access-token')?.value;
    const pathname = request.nextUrl.pathname;
    const isLoginPage = pathname.startsWith('/login');
    const isPublicPage = isLoginPage || 
                         pathname.startsWith('/forgot-password') || 
                         pathname.startsWith('/reset-password') ||
                         pathname.startsWith('/register');

    // Jika token terdeteksi kedaluwarsa secara mandiri di server, kosongkan status token
    if (token && isTokenExpired(token)) {
        token = undefined;
    }

    // KONDISI 1: Pengguna mencoba masuk Beranda tapi BELUM LOGIN -> Tendang ke halaman login
    if (!token && !isPublicPage) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // KONDISI 2 (Dihapus untuk mencegah loop): Biarkan halaman /login memvalidasi user ke backend secara client-side
    // Meskipun token ada, kita tidak bisa menjamin token valid di backend (misal: user dihapus).
    // Client-side supabase.auth.getUser() di /login yang akan melakukan redirect ke '/' jika benar-benar valid.

    // Jika token kedaluwarsa dan berada di halaman publik, pastikan cookie dibersihkan dari browser
    if (!token && isPublicPage && request.cookies.has('sb-access-token')) {
        const response = NextResponse.next();
        response.cookies.delete('sb-access-token');
        return response;
    }

    return NextResponse.next();
}

// Aturan rute mana saja yang wajib dijaga ketat oleh Satpam Gaib ini
export const config = {
    matcher: [
        '/',                   // Jaga Beranda
        '/login',              // Jaga halaman login
        '/login/:path*',       // Jaga sub-halaman login
        '/complete-profile',   // Jaga onboarding
        '/profile',            // Jaga halaman profil
        '/settings',           // Jaga halaman pengaturan
        '/matkul/:path*',      // Jaga workspace detail
        '/dosen',              // Jaga dashboard dosen
        '/dosen/:path*',
        '/admin',              // Jaga dashboard admin
        '/admin/:path*',
    ],
};