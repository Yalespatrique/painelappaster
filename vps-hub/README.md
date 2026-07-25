# Asterplay Hub (VPS)

Serviço Node/Docker que roda **fora do Lovable** com responsabilidades 24/7:

- `POST /webhooks/asaas` — recebe pagamentos e atualiza o banco
- `GET  /proxy/image?url=` — proxy de capas M3U para app Roku
- `GET  /health` — healthcheck
- **Cron interno** (`node-cron`):
  - `0 */6 * * *` — gera cobranças PIX para DNS vencendo
  - `*/15 * * * *` — envia lembretes WhatsApp via Evolution

Compartilha o **mesmo Supabase** do painel Lovable (usando `service_role`).

---

## Setup na VPS (primeira vez)

```bash
cd /opt/apps
git clone https://github.com/Yalespatrique/painelappaster.git asterplay-hub
cd asterplay-hub/vps-hub
cp .env.example .env
nano .env      # preencher SUPABASE_SERVICE_ROLE_KEY, ASAAS_API_KEY, EVOLUTION_*
docker compose up -d --build
docker compose logs -f hub
```

Testar:

```bash
curl http://127.0.0.1:8787/health
```

## Nginx + HTTPS

Aponte um subdomínio (ex: `hub.appasterplay.top`) para o IP da VPS e crie:

```nginx
server {
    server_name hub.appasterplay.top;
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    listen 80;
}
```

```bash
sudo certbot --nginx -d hub.appasterplay.top
```

No painel Asaas, defina o webhook como:
`https://hub.appasterplay.top/webhooks/asaas`

## Atualizações (rotina)

```bash
cd /opt/apps/asterplay-hub
git pull
cd vps-hub
docker compose up -d --build
```

## Variáveis de ambiente

Veja `.env.example`. O container lê `app_settings` do Supabase como fallback (`asaas`, `evolution`, `whatsapp_templates`), então você pode editar pelo painel admin sem redeploy.
