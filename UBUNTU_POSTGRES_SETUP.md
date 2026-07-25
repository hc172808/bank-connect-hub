# Virtual Bank — Ubuntu 22.04 + PostgreSQL Setup Guide

Complete steps to run the app on your own Ubuntu 22.04 server with a local PostgreSQL database.

---

## 1. Install PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Verify it's running:
```bash
sudo systemctl status postgresql
```

---

## 2. Create the Database and App User

```bash
sudo -u postgres psql <<'SQL'
-- Create a dedicated database
CREATE DATABASE virtualbank;

-- Create a low-privilege app user (replace the password)
CREATE USER virtualbank_app WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';

-- Grant connection and schema privileges
GRANT CONNECT ON DATABASE virtualbank TO virtualbank_app;

-- Also create the Supabase-compatible roles (needed by the schema)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon          NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated')  THEN CREATE ROLE authenticated  NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role')   THEN CREATE ROLE service_role   NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN CREATE ROLE supabase_admin NOLOGIN NOINHERIT BYPASSRLS; END IF;
END $$;

-- Allow the app user to act as authenticated/service_role
GRANT authenticated TO virtualbank_app;
GRANT service_role  TO virtualbank_app;
SQL
```

---

## 3. Run the Schema

Copy `postgres-setup.sql` to your server, then:

```bash
# From the project root (where postgres-setup.sql lives):
sudo -u postgres psql -d virtualbank -f postgres-setup.sql
```

You should see:
```
✅  Virtual Bank database setup complete.
```

Verify tables were created:
```bash
sudo -u postgres psql -d virtualbank -c \
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;"
```

Expected tables: `announcements`, `app_releases`, `app_settings`, `audit_logs`,
`biometric_credentials`, `blockchain_settings`, `changelog_entries`, `conversion_fees`,
`countries`, `database_backups`, `device_sessions`, `external_databases`,
`feature_toggles`, `fund_requests`, `fund_reversals`, `gas_fee_ledger`,
`kyc_submissions`, `mobile_money_providers`, `notifications`, `pending_deposits`,
`profiles`, `qr_card_requests`, `supported_coins`, `suspicious_activity_alerts`,
`transaction_fees`, `transactions`, `two_factor_auth`, `user_roles`,
`user_wallets`, `vendor_products`, `vendor_registration_fees`, `wallets`

---

## 4. Configure Your .env

```bash
cp .env.ubuntu.example .env
nano .env
```

Minimum required values to fill in:

| Variable | What to put |
|---|---|
| `DATABASE_URL` | `postgresql://virtualbank_app:YOUR_PASSWORD@localhost:5432/virtualbank` |
| `PGPASSWORD` | same password as above |
| `JWT_SECRET` | run `openssl rand -hex 64` and paste the result |
| `VITE_SUPABASE_URL` | URL of your GoTrue/PostgREST API (see §Auth below) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon JWT from your auth setup |

---

## 5. Auth — Two Options

### Option A: Self-hosted Supabase (recommended — zero code changes)

The app's frontend uses `@supabase/supabase-js`. The easiest way to keep it
working is to run the Supabase stack (GoTrue + PostgREST + Realtime) locally.
The project already includes a Docker Compose for this in `supabase-selfhost/`.

```bash
cd supabase-selfhost
cp .env.example .env     # fill in POSTGRES_PASSWORD, JWT_SECRET, etc.
docker compose up -d
```

Then in your main `.env`:
```
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key from supabase-selfhost/.env>
```

### Option B: Cloud Supabase (pointing at your DB)

Keep using Supabase cloud but configure it to use your PostgreSQL as the
underlying database. Log into your Supabase dashboard → Project Settings →
Database and point it at your server.

---

## 6. Install Node.js & App Dependencies

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install app dependencies
cd /path/to/your/app
npm install

# Build the frontend
npm run build
```

---

## 7. Run the App

### Option A: PM2 (recommended for production)

```bash
sudo npm install -g pm2

# Start both Vite preview + build-server
pm2 start npm --name virtualbank -- start
pm2 save
pm2 startup    # follow the printed command to enable autostart
```

Or create a PM2 ecosystem file:

```bash
cat > ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [
    {
      name: 'virtualbank-frontend',
      script: './node_modules/.bin/vite',
      args: 'preview --port 5000 --host 0.0.0.0',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'virtualbank-server',
      script: 'node',
      args: 'build-server.mjs',
      env_file: '.env'
    }
  ]
};
EOF

pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

### Option B: systemd service

```bash
sudo tee /etc/systemd/system/virtualbank.service > /dev/null <<EOF
[Unit]
Description=Virtual Bank App
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=/path/to/your/app
EnvironmentFile=/path/to/your/app/.env
ExecStart=/usr/bin/node dev-start.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now virtualbank
sudo journalctl -u virtualbank -f
```

---

## 8. Nginx Reverse Proxy (optional but recommended)

```bash
sudo apt install -y nginx

sudo tee /etc/nginx/sites-available/virtualbank > /dev/null <<'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    # Frontend (Vite)
    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Build server API
    location /api/ {
        proxy_pass         http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/virtualbank /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Add SSL with Let's Encrypt:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

---

## 9. Create Your First Admin User

After the app is running, register through the UI, then promote yourself to admin:

```bash
sudo -u postgres psql -d virtualbank <<'SQL'
-- Find your user UUID
SELECT id, phone_number, full_name FROM auth.users;

-- Promote to admin (replace the UUID)
UPDATE public.user_roles
SET role = 'admin'
WHERE user_id = 'YOUR-USER-UUID-HERE';

-- Verify
SELECT u.phone, ur.role
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.role = 'admin';
SQL
```

---

## 10. Scheduled Jobs (reversals processor)

The `process_pending_reversals()` function returns held funds after 1 hour.
Run it on a schedule:

```bash
# Add to crontab (runs every 5 minutes)
crontab -e
```

Add this line:
```
*/5 * * * * psql postgresql://virtualbank_app:PASSWORD@localhost/virtualbank -c "SELECT public.process_pending_reversals();" >> /var/log/virtualbank-cron.log 2>&1
```

---

## 11. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # ports 80 + 443
sudo ufw enable
sudo ufw status
```

Do NOT expose ports 5000, 3001, or 5432 directly to the internet.

---

## 12. Backups

```bash
# Daily backup cron
crontab -e
```
Add:
```
0 3 * * * pg_dump -U postgres virtualbank | gzip > /var/backups/virtualbank_$(date +\%Y\%m\%d).sql.gz
# Keep 30 days
0 4 * * * find /var/backups -name "virtualbank_*.sql.gz" -mtime +30 -delete
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `role "anon" does not exist` | Re-run step 2 to create the roles |
| `extension "pgcrypto" does not exist` | `sudo apt install postgresql-contrib` then re-run setup |
| `auth.uid() returns null` | Your app server must set `SET LOCAL app.current_user_id = '<uuid>'` before queries |
| App can't connect to DB | Check `DATABASE_URL` in `.env` and that `pg_hba.conf` allows local connections |
| RLS blocks all queries | Connect as `service_role` for admin tasks, `authenticated` for user queries |

---

## File Reference

| File | Purpose |
|---|---|
| `postgres-setup.sql` | Complete database schema — run once |
| `.env.ubuntu.example` | Environment variable template for Ubuntu |
| `build-server.mjs` | Node.js backend (APK builder, SMS, email, push) |
| `dev-start.mjs` | Starts both Vite + build-server together |
| `supabase-selfhost/` | Self-hosted Supabase stack (optional, for full compatibility) |
