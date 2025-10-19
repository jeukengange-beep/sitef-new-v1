import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.warn('Supabase env missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}
export const supabase = createClient(url, key, { auth: { persistSession: false } });
