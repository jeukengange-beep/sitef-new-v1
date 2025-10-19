import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

const resolveSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    throw new Error('SUPABASE_URL is not configured');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  return { url, serviceRoleKey };
};

export const getSupabaseClient = (): SupabaseClient => {
  if (client) {
    return client;
  }

  const { url, serviceRoleKey } = resolveSupabaseConfig();
  client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  return client;
};
