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

## Chat bot (Telegram / WhatsApp)
```bash
export NM_API=https://your-server NM_BOT_KEY=<same 16+ char secret the server has> TELEGRAM_TOKEN=<from @BotFather>
export NM_GEMINI_KEY=<optional, to transcribe voice notes>
node bot.mjs
```
Server needs `NM_BOT_KEY` too. In the app: Study Studio → Chat bot → “Get link code”, then send `/link CODE` to the bot. Messages understood: YouTube links, “remind me to … tomorrow / friday / 12 nov / in 3 days”, other links, plain notes, and voice notes (needs `NM_GEMINI_KEY`).
WhatsApp: `whatsapp()` in `bot.mjs` implements the Meta Cloud API webhook (signature check, verify challenge, text and audio). It needs a Meta Business account and a public HTTPS URL; mount it on your own web server. **Neither integration has been run against the real Telegram/WhatsApp services yet**: the tests use fakes.
