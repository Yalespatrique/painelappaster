import { Hono } from 'hono';
import { supabase, getAppSetting, hasServiceRoleCredentials } from '../lib/supabase.js';

export const asaasWebhook = new Hono();

const secureWebhookOrigin = (process.env.ASAAS_PROXY_ORIGIN || 'https://appasterplay.lovable.app').replace(/\/$/, '');

async function getExpectedToken(): Promise<string> {
  const s = await getAppSetting<{ webhook_token?: string }>('asaas');
  return s?.webhook_token || process.env.ASAAS_WEBHOOK_TOKEN || '';
}

async function proxyToSecureBackend(c: any) {
  const body = await c.req.text();
  const contentType = c.req.header('content-type') || 'application/json';
  const token = c.req.header('asaas-access-token') || c.req.header('access_token') || '';

  const response = await fetch(`${secureWebhookOrigin}/api/public/asaas-webhook`, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'asaas-access-token': token,
    },
    body,
  });

  const text = await response.text();
  return c.body(text || 'ok', response.status, {
    'content-type': response.headers.get('content-type') || 'text/plain',
  });
}

asaasWebhook.post('/', async (c) => {
  const provided = c.req.header('asaas-access-token') || c.req.header('access_token') || '';
  const expected = await getExpectedToken();
  if (!expected || provided !== expected) {
    console.warn('[asaas-webhook] token inválido');
    return c.text('Unauthorized', 401);
  }

  if (!hasServiceRoleCredentials) {
    console.log('[asaas-webhook] modo bridge: encaminhando para backend seguro');
    return proxyToSecureBackend(c);
  }

  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.text('Bad Request', 400);
  }

  const event = String(payload?.event || '');
  const payment = payload?.payment || {};
  const paymentId = String(payment?.id || '');
  const status = String(payment?.status || '');
  const externalReference = String(payment?.externalReference || '');

  console.log('[asaas-webhook]', event, paymentId, status, externalReference);

  const paidLike = /RECEIVED|CONFIRMED/i.test(status) || /PAYMENT_(RECEIVED|CONFIRMED)/i.test(event);

  try {
    // 1) DNS payments
    const { data: dnsPay } = await supabase
      .from('dns_payments')
      .select('id, dns_id, months, owner_user_id')
      .eq('asaas_payment_id', paymentId)
      .maybeSingle();

    if (dnsPay) {
      await supabase
        .from('dns_payments')
        .update({ status, paid_at: paidLike ? new Date().toISOString() : null })
        .eq('id', dnsPay.id);

      if (paidLike && dnsPay.dns_id) {
        const months = dnsPay.months ?? 1;
        const { data: dns } = await supabase
          .from('dns_whitelist')
          .select('expires_at')
          .eq('id', dnsPay.dns_id)
          .maybeSingle();
        const base = dns?.expires_at && new Date(dns.expires_at) > new Date()
          ? new Date(dns.expires_at)
          : new Date();
        base.setMonth(base.getMonth() + months);
        await supabase
          .from('dns_whitelist')
          .update({ expires_at: base.toISOString() })
          .eq('id', dnsPay.dns_id);

        await supabase.rpc('credit_affiliate_commission', {
          _source_type: 'dns_client',
          _payment_id: dnsPay.id,
        });
      }

      return c.json({ ok: true, handled: 'dns_payment' });
    }

    // 2) Device payments
    const { data: devicePay } = await supabase
      .from('payments')
      .select('id, device_mac, months')
      .eq('asaas_payment_id', paymentId)
      .maybeSingle();

    if (devicePay) {
      await supabase
        .from('payments')
        .update({ status, paid_at: paidLike ? new Date().toISOString() : null })
        .eq('id', devicePay.id);

      if (paidLike && devicePay.device_mac) {
        const months = devicePay.months ?? 1;
        const { data: dev } = await supabase
          .from('devices')
          .select('activated_until')
          .eq('mac', devicePay.device_mac.toUpperCase())
          .maybeSingle();
        const base = dev?.activated_until && new Date(dev.activated_until) > new Date()
          ? new Date(dev.activated_until)
          : new Date();
        base.setMonth(base.getMonth() + months);
        await supabase
          .from('devices')
          .update({ activated_until: base.toISOString() })
          .eq('mac', devicePay.device_mac.toUpperCase());

        await supabase.rpc('credit_affiliate_commission', {
          _source_type: 'device',
          _payment_id: devicePay.id,
        });
      }

      return c.json({ ok: true, handled: 'device_payment' });
    }

    console.warn('[asaas-webhook] pagamento não encontrado', paymentId);
    return c.json({ ok: true, handled: 'unknown', payment_id: paymentId });
  } catch (err: any) {
    console.error('[asaas-webhook] erro', err?.message || err);
    return c.json({ ok: false, error: err?.message || 'erro' }, 500);
  }
});
