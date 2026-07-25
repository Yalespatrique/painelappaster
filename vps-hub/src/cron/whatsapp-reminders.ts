import { supabase, getAppSetting } from '../lib/supabase.js';
import { sendWhatsappText } from '../lib/evolution.js';

type Templates = {
  charge_message?: string;
  paid_message?: string;
  days_before?: number[];
};

function renderTemplate(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
}

/**
 * Envia lembretes de cobrança para DNS vencendo (a intervalos configurados)
 * e evita duplicar envios no mesmo dia.
 */
export async function runWhatsappReminders() {
  const templates = (await getAppSetting<Templates>('whatsapp_templates')) || {};
  const chargeTpl =
    templates.charge_message ||
    'Olá {{name}}! 👋 Sua mensalidade Aster Play de R$ {{amount}} vence em {{days}} dia(s). PIX: {{pix}}';
  const daysBefore = templates.days_before?.length ? templates.days_before : [5, 3, 1, 0];

  const now = new Date();
  const maxDays = Math.max(...daysBefore);
  const horizon = new Date(now.getTime() + (maxDays + 1) * 24 * 60 * 60 * 1000);

  const { data: dnsList } = await supabase
    .from('dns_whitelist')
    .select('id, host, expires_at, price_cents, owner_user_id')
    .lte('expires_at', horizon.toISOString())
    .not('owner_user_id', 'is', null);

  if (!dnsList?.length) return { sent: 0 };

  let sent = 0;

  for (const dns of dnsList) {
    try {
      const expires = new Date(dns.expires_at);
      const diffDays = Math.ceil((expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (!daysBefore.includes(diffDays)) continue;

      const { data: contact } = await supabase
        .from('user_contacts')
        .select('name, phone')
        .eq('user_id', dns.owner_user_id!)
        .maybeSingle();
      if (!contact?.phone) continue;

      // já enviou hoje?
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const { data: dupe } = await supabase
        .from('whatsapp_reminders_log')
        .select('id')
        .eq('dns_id', dns.id)
        .eq('kind', 'charge')
        .gte('created_at', startOfDay)
        .limit(1);
      if (dupe?.length) continue;

      const { data: pay } = await supabase
        .from('dns_payments')
        .select('pix_copy_paste')
        .eq('dns_id', dns.id)
        .not('status', 'in', '(RECEIVED,CONFIRMED,PAID,CANCELLED,REFUNDED)')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const text = renderTemplate(chargeTpl, {
        name: contact.name || 'cliente',
        amount: ((dns.price_cents ?? 0) / 100).toFixed(2),
        days: diffDays,
        host: dns.host,
        pix: pay?.pix_copy_paste || '(gere no painel)',
      });

      let status = 'sent';
      let providerResponse: any = null;
      try {
        providerResponse = await sendWhatsappText(contact.phone, text);
      } catch (err: any) {
        status = 'failed';
        providerResponse = { error: err?.message || String(err) };
      }

      await supabase.from('whatsapp_reminders_log').insert({
        dns_id: dns.id,
        user_id: dns.owner_user_id,
        phone: contact.phone,
        kind: 'charge',
        message: text,
        status,
        provider_response: providerResponse,
      });

      if (status === 'sent') sent++;
    } catch (err: any) {
      console.error('[whatsapp-reminders] erro', dns.host, err?.message || err);
    }
  }

  console.log(`[whatsapp-reminders] enviados ${sent}`);
  return { sent };
}
