# Notes Maker AI — reference accounts server

A small, dependency-free Node server (20+) that adds what institutions need before they can pay: **accounts, roles, classes and encrypted sync**.
It is a **reference implementation**: JSON-file storage, no TLS (run it behind HTTPS), basic rate limiting. Review it before real student data goes near it.

```bash
NM_SECRET="$(openssl rand -hex 32)" NM_ORIGIN="https://your-app.example" node server.mjs   # PORT=8787
node --test test.mjs bot.test.mjs                                                       # server + bot tests
```

| Method & path | Who | What |
|---|---|---|
| `POST /register` `{email,password,name,role}` | anyone | scrypt-hashed password; role `student` (default) or `teacher` |
| `POST /login` | anyone | rate limited (10 / minute / IP); returns a signed 7-day token |
| `GET /me`, `DELETE /me` | signed in | profile; **delete account and all its data** |
| `POST /classes` `{name}` | teacher | creates a class with a join code |
| `POST /classes/join` `{code}` | student | joins a class |
| `POST /classes/report` `{code, report}` | student | sends the progress report file (name comes from the account, not the file) |
| `GET /classes/dashboard?code=` | the class’s teacher only | reports of every student in the class |
| `PUT / GET /sync` `{blob}` | signed in | one **client-side encrypted** blob per user (the server never sees the key) |
| `GET /market/listings?q=&subject=` | anyone | public browse: previews only, never the body or UPI ID |
| `POST /market/listings` | signed in | publish notes: free, or ₹5–₹500 with the creator's UPI ID |
| `GET /market/listing?id=` | signed in | full notes if free, yours, or your purchase is confirmed; otherwise payment details |
| `POST /market/purchase` `{id, utr}` | signed in | buyer reports a UPI payment (12-digit UTR, each UTR usable once) |
| `POST /market/confirm` `{purchase, accept}` | the creator only | creator confirms they received the money; notes unlock |
| `GET /market/mine`, `POST /market/report`, `POST /market/unlist` | signed in | sales/purchases, report (3 reports hide), unlist |
| `POST /bot/link` | signed in | one-time 6-character code (10 min) to link a Telegram/WhatsApp chat |
| `POST /bot/claim`, `POST /bot/push` | the bot only (`x-bot-key`) | link a chat; push tasks / links / notes into a user's inbox |
| `GET /inbox`, `POST /inbox/ack` | signed in | the app pulls the inbox into the planner and acknowledges it |

**Not done yet (be honest with institutions):** email verification and password reset, TLS, a real database, audit logs, backups, an external security review, and wiring the web app’s sign-in screen to this API.

## Payments (UPI) — what is and is not real
The marketplace never touches money. The buyer pays the creator **directly from their own UPI app** (a `upi://pay` link is generated), then types the 12-digit UTR; the creator checks their bank and presses “Money received”. There is **no automatic payment verification**, no escrow, no refunds, no GST/TDS handling and no payout reporting. A real launch needs a payment gateway (Razorpay/Cashfree UPI collect + webhooks), KYC for sellers, and a terms/refund policy reviewed by a lawyer.

### Online payments mode (Razorpay) — optional, NOT tested against live Razorpay
Set `RZP_KEY_ID`, `RZP_KEY_SECRET`, `RZP_WEBHOOK_SECRET` (and optionally `NM_FEE_PCT`, default 10). Then manual UTR purchases are switched off and buyers use **Pay securely**:
`POST /market/checkout` creates a Razorpay Payment Link; Razorpay calls `POST /webhooks/razorpay` (point the dashboard webhook at it, event `payment_link.paid`). The server verifies the `X-Razorpay-Signature` HMAC over the raw body, checks amount/currency/link id, is idempotent per payment id, and only then unlocks the notes. A creator cannot self-confirm an online sale.
Honest limits: the code is verified only against a fake Razorpay in `gateway.test.mjs` (the sandbox has no internet and no Razorpay account). Money lands in **your** Razorpay account; `GET /market/earnings` shows what each creator is owed after the fee, but **paying creators out is manual** unless you add Razorpay Route (needs KYC). Refunds and disputes are handled in the Razorpay dashboard. Run a ₹5 test-mode payment before going live.

## Chat bot (Telegram / WhatsApp): simplest way
Set `NM_BOT_KEY` (16+ chars) and `TELEGRAM_TOKEN` (from @BotFather) on the server and restart: **the bot now runs inside the same process**, no second program. For WhatsApp also set `WA_TOKEN`, `WA_PHONE_ID`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN` and register `https://<server>/webhooks/whatsapp` in Meta (subscribe to `messages`). Check with `node bot.mjs --check`; in the app the Bot tab shows which transports are running. `bot.e2e.test.mjs` proves the whole chain against fake Telegram/Meta servers; real Telegram/WhatsApp delivery is still unverified in this repo.

## Chat bot (Telegram / WhatsApp): separate process
```bash
export NM_API=https://your-server NM_BOT_KEY=<same 16+ char secret the server has> TELEGRAM_TOKEN=<from @BotFather>
export NM_GEMINI_KEY=<optional, to transcribe voice notes>
node bot.mjs
node bot.mjs --check   # verifies server, bot key, Telegram token/webhook and WhatsApp number in seconds; sends nothing
```
Server needs `NM_BOT_KEY` too. In the app: Study Studio → Chat bot → “Get link code”, then send `/link CODE` to the bot. Messages understood: YouTube links, “remind me to … tomorrow / friday / 12 nov / in 3 days”, other links, plain notes, and voice notes (needs `NM_GEMINI_KEY`).
WhatsApp: `whatsapp()` in `bot.mjs` implements the Meta Cloud API webhook (signature check, verify challenge, text and audio). It needs a Meta Business account and a public HTTPS URL; mount it on your own web server. **Neither integration has been run against the real Telegram/WhatsApp services yet**: the tests use fakes.
