import { getAppSetting } from './supabase.js';

const FALLBACK_CPF = '03410201173';
const FALLBACK_NAME = 'Gleissiane Silva Jardim';

async function getAsaasCreds() {
  const settings = await getAppSetting<{ api_key?: string; api_url?: string }>('asaas');
  const apiKey = settings?.api_key || process.env.ASAAS_API_KEY || '';
  const apiUrl = settings?.api_url || process.env.ASAAS_API_URL || 'https://api.asaas.com/v3';
  return { apiKey, apiUrl };
}

async function asaasFetch(path: string, init: RequestInit = {}) {
  const { apiKey, apiUrl } = await getAsaasCreds();
  if (!apiKey) throw new Error('Asaas API key não configurada');
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey,
      ...(init.headers || {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Asaas ${res.status}: ${body}`);
  return body ? JSON.parse(body) : {};
}

export async function ensureCustomer(params: {
  name?: string | null;
  cpfCnpj?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const clean = (v?: string | null) => (v || '').replace(/\D/g, '');
  let cpfCnpj = clean(params.cpfCnpj);
  let name = params.name?.trim() || '';
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
    cpfCnpj = FALLBACK_CPF;
    if (!name) name = FALLBACK_NAME;
  }
  if (!name) name = FALLBACK_NAME;

  const found = await asaasFetch(`/customers?cpfCnpj=${cpfCnpj}`).catch(() => ({ data: [] }));
  if (found?.data?.[0]?.id) return found.data[0].id as string;

  const created = await asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name,
      cpfCnpj,
      email: params.email || undefined,
      mobilePhone: params.phone ? clean(params.phone) : undefined,
    }),
  });
  return created.id as string;
}

export async function createPixCharge(params: {
  customerId: string;
  value: number;
  description: string;
  externalReference?: string;
}) {
  const due = new Date();
  due.setDate(due.getDate() + 3);
  return asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: params.customerId,
      billingType: 'PIX',
      value: params.value,
      dueDate: due.toISOString().slice(0, 10),
      description: params.description,
      externalReference: params.externalReference,
    }),
  });
}
