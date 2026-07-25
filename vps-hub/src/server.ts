import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import cron from 'node-cron';

import { health } from './routes/health.js';
import { asaasWebhook } from './routes/asaas-webhook.js';
import { imageProxy } from './routes/image-proxy.js';
import { runDnsRenewal } from './cron/dns-renewal.js';
import { runWhatsappReminders } from './cron/whatsapp-reminders.js';
import { hasServiceRoleCredentials } from './lib/supabase.js';

const app = new Hono();

app.route('/health', health);
app.route('/webhooks/asaas', asaasWebhook);
app.route('/proxy/image', imageProxy);

// endpoints manuais para disparar crons (útil pra teste/pg_cron)
app.post('/cron/dns-renewal', async (c) => c.json(await runDnsRenewal()));
app.post('/cron/whatsapp-reminders', async (c) => c.json(await runWhatsappReminders()));

app.get('/', (c) => c.text('Asterplay Hub — ver /health'));

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 asterplay-hub ouvindo em http://0.0.0.0:${info.port}`);
});

// Crons agendadas
if (!hasServiceRoleCredentials) {
  console.log('🌉 modo bridge ativo: crons locais desativados sem SERVICE_ROLE_KEY');
} else if (process.env.CRON_DNS_RENEWAL !== 'false') {
  cron.schedule('0 */6 * * *', () => {
    runDnsRenewal().catch((e) => console.error('[cron dns-renewal]', e));
  });
  console.log('⏰ cron dns-renewal: a cada 6h');
}

if (hasServiceRoleCredentials && process.env.CRON_WHATSAPP_REMINDERS !== 'false') {
  cron.schedule('*/15 * * * *', () => {
    runWhatsappReminders().catch((e) => console.error('[cron whatsapp]', e));
  });
  console.log('⏰ cron whatsapp-reminders: a cada 15min');
}

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
