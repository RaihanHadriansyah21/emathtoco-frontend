function requiredPublicValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Konfigurasi wajib belum diisi: ${name}`);
  }
  return value;
}

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? (
    process.env.NODE_ENV !== 'production'
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : undefined
  );

export const publicEnv = {
  supabaseUrl: requiredPublicValue(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: requiredPublicValue(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    supabasePublishableKey,
  ),
  apiUrl: requiredPublicValue(
    'NEXT_PUBLIC_API_URL',
    process.env.NEXT_PUBLIC_API_URL,
  ).replace(/\/+$/, ''),
};

if (
  process.env.NODE_ENV === 'production'
  && !publicEnv.apiUrl.startsWith('https://')
) {
  throw new Error('NEXT_PUBLIC_API_URL production wajib menggunakan HTTPS.');
}
