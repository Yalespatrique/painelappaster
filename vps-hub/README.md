# Asterplay Hub (VPS)

Serviço Node/Docker que roda **fora do Lovable** com responsabilidades 24/7:

- `POST /webhooks/asaas` — recebe pagamentos; com `SERVICE_ROLE_KEY` atualiza o banco, sem ela encaminha para o backend seguro
- `GET  /proxy/image?url=` — proxy de capas M3U para app Roku
- `GET  /health` — healthcheck
- **Cron interno** (`node-cron`):
  - `0 */6 * * *` — gera cobranças PIX para DNS vencendo
  - `*/15 * * * *` — envia lembretes WhatsApp via Evolution

Quando houver `SUPABASE_SERVICE_ROLE_KEY`, compartilha o mesmo banco do painel. Sem essa chave, roda em **modo bridge** para receber o webhook na VPS e encaminhar ao backend seguro.

---

## Setup na VPS (primeira vez)

```bash
cd /opt/apps
git clone https://github.com/Yalespatrique/painelappaster.git asterplay-hub
cd asterplay-hub/vps-hub
cp .env.example .env
nano .env      # preencher ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN e EVOLUTION_*; SERVICE_ROLE_KEY pode ficar vazia
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

Veja `.env.example`. Se `SUPABASE_SERVICE_ROLE_KEY` ficar vazia, o `/health` e o webhook Asaas funcionam em modo bridge; os crons locais ficam desativados.
