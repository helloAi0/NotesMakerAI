# Notes Maker AI — reference accounts server

A small, dependency-free Node server (20+) that adds what institutions need before they can pay: **accounts, roles, classes and encrypted sync**.
It is a **reference implementation**: JSON-file storage, no TLS (run it behind HTTPS), basic rate limiting. Review it before real student data goes near it.

```bash
NM_SECRET="$(openssl rand -hex 32)" NM_ORIGIN="https://your-app.example" node server.mjs   # PORT=8787
node --test test.mjs                                                                    # 7 test groups
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

**Not done yet (be honest with institutions):** email verification and password reset, TLS, a real database, audit logs, backups, an external security review, and wiring the web app’s sign-in screen to this API.
