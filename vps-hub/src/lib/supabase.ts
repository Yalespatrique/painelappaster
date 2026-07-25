import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente');
}

export const supabase = createClient(url ?? '', key ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function getAppSetting<T = any>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    console.error('[app_settings] erro lendo', key, error.message);
    return null;
  }
  return (data?.value as T) ?? null;
}
