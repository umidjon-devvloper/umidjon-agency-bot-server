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

Sayt root'idagi `.env` ga:

```
LEAD_BOT_URL=https://bot.sizning-domen.uz
LEAD_BOT_API_KEY=<bot-server/.env dagi LEAD_API_KEY bilan bir xil>
```

`LEAD_BOT_URL` qo'yilgan zahoti sayt Telegramga o'zi murojaat qilmaydi, hammasini
shu serverga uzatadi. Vercel'da bu ikkalasini Project → Settings → Environment
Variables ga qo'shish kerak.

## 5. Deploy

Har qanday Node host bo'ladi (Railway, Render, Fly, VPS). Kerakli sozlama:

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
