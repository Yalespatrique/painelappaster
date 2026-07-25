import { supabase } from '../lib/supabase.js';
import { ensureCustomer, createPixCharge } from '../lib/asaas.js';

/**
 * Gera cobrança PIX para toda DNS que vence nos próximos 5 dias
 * e ainda não tem cobrança pendente.
 */
export async function runDnsRenewal() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  const { data: dnsList, error } = await supabase
    .from('dns_whitelist')
    .select('id, host, price_cents, plan_type, expires_at, owner_user_id')
    .lte('expires_at', horizon.toISOString())
    .not('owner_user_id', 'is', null);

  if (error) throw new Error(`dns_whitelist: ${error.message}`);
  if (!dnsList?.length) return { generated: 0 };

  let generated = 0;

  for (const dns of dnsList) {
    try {
      const price = dns.price_cents ?? 0;
      if (price <= 0) continue;

      // já existe cobrança pendente?
      const { data: pending } = await supabase
        .from('dns_payments')
        .select('id')
        .eq('dns_id', dns.id)
        .not('status', 'in', '(RECEIVED,CONFIRMED,PAID,CANCELLED,REFUNDED)')
        .limit(1);
      if (pending?.length) continue;

      // dados do dono
      const { data: userRow } = await supabase
        .from('user_contacts')
        .select('name, cpf_cnpj, phone, email')
        .eq('user_id', dns.owner_user_id!)
        .maybeSingle();

      const customerId = await ensureCustomer({
        name: userRow?.name,
        cpfCnpj: userRow?.cpf_cnpj,
        email: userRow?.email,
        phone: userRow?.phone,
      });

      const charge = await createPixCharge({
        customerId,
        value: price / 100,
        description: `Renovação DNS ${dns.host} — 1 mês`,
        externalReference: `dns:${dns.id}`,
      });

      await supabase.from('dns_payments').insert({
        dns_id: dns.id,
        owner_user_id: dns.owner_user_id,
        amount_cents: price,
        months: 1,
        status: charge.status || 'PENDING',
        asaas_payment_id: charge.id,
        asaas_invoice_url: charge.invoiceUrl,
        pix_copy_paste: charge.pixCopiaECola || null,
      });

      generated++;
    } catch (err: any) {
      console.error('[dns-renewal] erro', dns.host, err?.message || err);
    }
  }

  console.log(`[dns-renewal] geradas ${generated} cobranças`);
  return { generated };
}
