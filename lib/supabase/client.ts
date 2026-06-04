import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const getSupabaseClient = (): SupabaseClient => {
  if (typeof window === 'undefined') {
    return createClient(supabaseUrl, supabaseAnonKey);
  }

  const globalVar = globalThis as any;
  if (!globalVar.__supabaseClient) {
    globalVar.__supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
      }
    });
  }
  return globalVar.__supabaseClient;
};

export const supabase = getSupabaseClient();
