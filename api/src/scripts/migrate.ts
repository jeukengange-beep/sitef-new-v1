import 'dotenv/config';
import { getSupabaseClient } from '../db/connection';

const supabase = getSupabaseClient();

const main = async () => {
  const { error } = await supabase.from('projects').select('id').limit(1);

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  console.log('Supabase connection verified.');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
