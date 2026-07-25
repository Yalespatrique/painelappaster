import { getAppSetting } from './supabase.js';

type EvoCreds = { url: string; api_key: string; instance: string };

async function getEvoCreds(): Promise<EvoCreds | null> {
  const s = await getAppSetting<Partial<EvoCreds>>('evolution');
  const url = (s?.url || process.env.EVOLUTION_URL || '').replace(/\/$/, '');
  const api_key = s?.api_key || process.env.EVOLUTION_API_KEY || '';
  const instance = s?.instance || process.env.EVOLUTION_INSTANCE || '';
  if (!url || !api_key || !instance) return null;
  return { url, api_key, instance };
}

export async function sendWhatsappText(to: string, text: string) {
  const creds = await getEvoCreds();
  if (!creds) throw new Error('Evolution não configurada');
  const number = to.replace(/\D/g, '');
  const res = await fetch(`${creds.url}/message/sendText/${creds.instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: creds.api_key },
    body: JSON.stringify({ number, text }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${body}`);
  return body ? JSON.parse(body) : {};
}
