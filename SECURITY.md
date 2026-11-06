# Security policy

## Reporting a vulnerability
Please email the maintainers privately (or use GitHub's "Report a vulnerability" button under the Security tab). Do not open a public issue. We aim to reply within 5 days.

## What the project does
- AI keys are stored only in the user's browser and sent only to the provider they chose. They never go to the Notes Maker server.
- The accounts server stores passwords with scrypt and a per-user salt, signs sessions with an HMAC token that is revoked on password change, rate-limits sign-in and write routes, validates every input and sends security headers.
- Payments: the Razorpay webhook is verified by HMAC signature over the raw body, the amount is re-checked and each payment id is processed once. Card and UPI details never touch this server.
- The web app ships a strict Content-Security-Policy.

## Known limits (be honest with users and institutions)
No email verification or password-reset-by-email yet, no external penetration test, JSON-file storage (not a database), no audit log, and payouts to creators are manual. Run `npm audit` regularly; four low-severity advisories in the katex rendering chain are currently open.
