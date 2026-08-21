# Bloom lead bot

Saytdagi formalardan kelgan arizalarni (lead) Telegramga yuboradigan **alohida
backend server**. Saytdan mustaqil ishlaydi: sayt qayta deploy bo'layotganda ham
bot ishlab turadi, bot token esa faqat shu yerda saqlanadi.

Hech qanday npm paket kerak emas — Node 20+ ning o'zi yetadi (`node_modules` yo'q).

```
sayt formasi → sayt backendi (submitLead → Mongo) → POST /api/lead → Telegram
```

## 1. Botni yaratish

1. Telegramda [@BotFather](https://t.me/BotFather) ga `/newbot` yozing.
2. Bergan tokenni saqlang.

## 2. Ishga tushirish (local)

```bash
cd bot-server
cp .env.example .env      # TELEGRAM_BOT_TOKEN ni yozing
npm run dev               # http://localhost:8787
```

Server ko'tarilgach botga Telegramda **/start** yozing — bot chat id ni javob
qiladi. O'sha id ni `.env` dagi `TELEGRAM_CHAT_ID` ga qo'ying va serverni qayta
ishga tushiring. Bir nechta chat kerak bo'lsa vergul bilan yozing:
`TELEGRAM_CHAT_ID=123456789,-1001234567890`.

Guruhga yuborish uchun: botni guruhga qo'shing, guruhda `/id` yozing.

## 3. Tekshirish

```bash
curl -X POST http://localhost:8787/api/lead \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $LEAD_API_KEY" \
  -d '{"name":"Test","contact":"+998901234567","note":"Sinov","source":"curl"}'
```

Telegramga xabar kelishi kerak.

## 4. Saytni ulash

Servis manzili sayt kodiga standart qiymat sifatida yozilgan
(`src/api/telegram.ts` → `DEFAULT_BOT_URL = https://umidjon-agency-bot-server.fly.dev`),
shuning uchun URL uchun alohida sozlama shart emas.

`LEAD_API_KEY` qo'yilgan bo'lsa, sayt tomonida ham bir xil qiymat kerak — sayt
root'idagi `.env` ga (Vercel'da Project → Settings → Environment Variables):

```
LEAD_BOT_API_KEY=<bot-server dagi LEAD_API_KEY bilan bir xil>
LEAD_BOT_URL=            # ixtiyoriy: boshqa deploy'ga yo'naltirish uchun
```

`LEAD_BOT_URL` ni bo'sh satr qilib qo'ysangiz sayt eski yo'lga qaytadi va
Telegramga o'zi murojaat qiladi.

## 5. Deploy — Fly.io

Repoda tayyor [`fly.toml`](fly.toml) va [`Dockerfile`](Dockerfile) bor.

```bash
cd bot-server
fly deploy
fly secrets set \
  TELEGRAM_BOT_TOKEN=<token> \
  TELEGRAM_CHAT_ID=<chat id> \
  LEAD_API_KEY=<uzun tasodifiy so'z>
fly status                 # machine "started" bo'lishi kerak
curl https://umidjon-agency-bot-server.fly.dev/health
```

**Muhim ikki narsa:**

1. **Port.** Fly konteynerga `8080` portdan kiradi (`internal_port`). Server
   `PORT` bo'sh bo'lsa 8080 ni oladi, `fly.toml` da ham 8080 yozilgan — ikkisi mos
   bo'lishi shart. `.env` dagi `PORT=8787` faqat local uchun; uni Fly secret
   sifatida qo'ymang, aks holda proxy serverni topa olmay so'rov timeout bo'ladi.
2. **Machine to'xtamasin.** `auto_stop_machines = "off"` va
   `min_machines_running = 1` — bot long-polling bilan ishlaydi, machine uxlab
   qolsa Telegramni tinglashni to'xtatadi.

Secretlarni `fly secrets set` orqali qo'ying — `.env` fayl image ichiga
tushmaydi (`.gitignore` da) va tushmasligi ham kerak.

`data/leads.jsonl` machine qayta ishga tushganda o'chadi (Fly disk vaqtinchalik).
Doimiy kerak bo'lsa volume ulang; asosiy nusxalar baribir Telegram va saytning
Mongo bazasida.

### Boshqa hostlar

- Start command: `npm start`
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `LEAD_API_KEY`, `PORT`
- Health check: `GET /health`

VPS'da systemd bilan:

```ini
# /etc/systemd/system/lead-bot.service
[Service]
WorkingDirectory=/srv/lead-bot
ExecStart=/usr/bin/node --env-file=.env src/index.js
Restart=always
[Install]
WantedBy=multi-user.target
```

### Polling yoki webhook

Standart rejim — **polling** (`BOT_POLLING=true`): public URL, TLS va ro'yxatdan
o'tkazish kerak emas, hamma joyda ishlaydi.

Public https domen bo'lsa webhook tezroq:

```bash
# .env: BOT_POLLING=false, TELEGRAM_WEBHOOK_SECRET=<tasodifiy uzun so'z>
node --env-file=.env scripts/set-webhook.js https://bot.sizning-domen.uz
```

Ikkalasi bir vaqtda ishlamaydi — Telegram ruxsat bermaydi.

## Endpointlar

| Method | Path | Nima qiladi |
| --- | --- | --- |
| `GET` | `/health` | Server holati, ulangan chatlar soni |
| `POST` | `/api/lead` | Lead qabul qiladi va Telegramga yuboradi |
| `POST` | `/api/telegram/webhook` | Telegram update'lari (webhook rejimi) |

`POST /api/lead` body:

```json
{
  "name": "Ism",            // majburiy
  "contact": "+998...",     // majburiy — telefon yoki @username
  "email": "a@b.uz",
  "note": "Izoh",
  "source": "Contact page",
  "lang": "uz",
  "metadata": { "priceRange": "$300–$500", "summary": [] }
}
```

## Himoya

- `LEAD_API_KEY` — `x-api-key` header orqali tekshiriladi (constant-time).
- `ALLOWED_ORIGINS` — brauzerdan kelgan so'rovlar uchun oq ro'yxat.
- IP bo'yicha limit: 10 ta so'rov / 10 daqiqa.
- `website` maydoni to'ldirilgan so'rov (honeypot) rad etiladi.
- Har bir lead avval `data/leads.jsonl` ga yoziladi — Telegram ishlamay qolsa ham
  ariza yo'qolmaydi.

## Bot buyruqlari

- `/start`, `/help` — yordam va chat id
- `/id` — shu chat id si
- `/ping` — server ishlayaptimi, shu chat ro'yxatdami
