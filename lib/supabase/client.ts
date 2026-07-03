import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { publicEnv } from '@/lib/env';

const getSupabaseClient = (): SupabaseClient => {
  const globalVar = globalThis as typeof globalThis & {
    __emathtocoSupabaseClient?: SupabaseClient;
  };
  if (!globalVar.__emathtocoSupabaseClient) {
    globalVar.__emathtocoSupabaseClient = createBrowserClient(
      publicEnv.supabaseUrl,
      publicEnv.supabasePublishableKey,
    );
  }
  return globalVar.__emathtocoSupabaseClient;
};

export const supabase = getSupabaseClient();
