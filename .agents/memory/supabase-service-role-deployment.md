---
name: Supabase service-role deployment
description: Keep the Supabase admin key available across cloud, self-hosted, systemd, PM2, and Docker updates.
---

The service-role JWT may be named `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_KEY`, or `SERVICE_ROLE_KEY` depending on the deployment path. Server startup and update scripts must accept these aliases and normalize the value before restarting.

**Why:** Self-hosted Supabase stores `SERVICE_ROLE_KEY` in its own Docker dotenv file, while the application deployment may omit it from the app environment. A restart can then make all staff verification and admin operations fail even though Supabase itself is healthy.

**How to apply:** Keep the canonical key in the application `.env`, recover it from the self-hosted Supabase dotenv/credentials file when available, and pass it explicitly into Docker build-server containers. Never print the value in update logs.