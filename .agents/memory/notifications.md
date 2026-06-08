---
name: SMS + Email alert architecture
description: How Twilio SMS and SMTP email alerts are wired in this project
---

## SMS (Twilio)
- Handled entirely in `build-server.mjs` (Node.js server on port 3001)
- Endpoints: `GET /api/sms/status`, `POST /api/sms/send`, `POST /api/sms/transaction-alert`, `POST /api/sms/broadcast`
- Env vars needed: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- Frontend utility: `src/lib/smsAlerts.ts` — fire-and-forget, never throws
- Triggered after successful SendMoney transfer (both sender + receiver notified)

## Email (SMTP/nodemailer)
- Handled in `build-server.mjs`
- Endpoints: `GET /api/email/status`, `POST /api/email/send`, `POST /api/email/transaction-alert`
- Env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME`
- Frontend utility: `src/lib/emailAlerts.ts` — fire-and-forget, never throws
- Works with Gmail (App Password), SendGrid, Mailgun, Brevo, SES

**Why:** SMS/email must never block the UI. All calls are fire-and-forget. If Twilio/SMTP is not configured, build-server returns 503 and the frontend silently continues.
