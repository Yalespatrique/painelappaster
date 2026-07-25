import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasServiceRoleCredentials = Boolean(url && key);

if (!hasServiceRoleCredentials) {
  console.warn('[supabase] sem SERVICE_ROLE_KEY: hub rodando em modo bridge/health-only');
}

export const supabase = (hasServiceRoleCredentials
  ? createClient(url as string, key as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : new Proxy({} as SupabaseClient, {
      get() {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente no hub');
      },
    })) as SupabaseClient;

export async function getAppSetting<T = any>(key: string): Promise<T | null> {
  if (!hasServiceRoleCredentials) return null;

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
