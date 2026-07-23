import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /auth/callback
 *
 * Server-side route handler for Supabase email confirmation.
 * When a user clicks the confirmation link in their email, Supabase
 * redirects here with a `code` query parameter. We exchange that code
 * for a session, then redirect the user to the appropriate page.
 *
 * Flow:
 *   1. Email confirmation link → /auth/callback?code=xxx
 *   2. Exchange code for session → user is now authenticated
 *   3. Check if user has a profile in `profil_pengguna`
 *      - No profile → redirect to /complete-profile
 *      - Has profile → redirect to / (dashboard)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? null;

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Session is now active — check if user already has a profile
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from('profil_pengguna')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile) {
          // New user without profile → complete profile first
          return NextResponse.redirect(`${origin}/complete-profile`);
        }
      }

      // User has profile or custom next path → redirect accordingly
      const redirectTo = next ?? '/';
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // If code exchange failed or no code provided, redirect to login
  // with a generic error message
  return NextResponse.redirect(
    `${origin}/login?select=true`
  );
}
