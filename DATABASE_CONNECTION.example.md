# NETLIFE CASH PostgreSQL connection information

This file is a safe template. The real connection details are generated into
`.local/database-connection.local.md` by:

```bash
npm run db:setup -- --mode=local
```

## Supported modes

| `DATABASE_MODE` | Behavior |
| --- | --- |
| `replit` | Uses the PostgreSQL database provisioned for this Replit project. |
| `local` | Starts PostgreSQL and pgAdmin from `db-server/docker-compose.yml`. |
| `remote` | Uses the `DATABASE_URL` supplied for an external PostgreSQL server. |

## Local services

- PostgreSQL: `127.0.0.1:5432`
- pgAdmin: `http://127.0.0.1:5050`
- pgAdmin server host from inside Docker: `postgres`
- Database: `netlifecash`
- User: `postgres`

The local password, pgAdmin password, and complete connection URL are never
committed. They are written to `.env`, `db-server/.env`, and the ignored local
connection file.

## Remote mode

Set these values in `.env`:

```dotenv
DATABASE_MODE=remote
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

Then verify the connection:

```bash
npm run db:check
```

## Safety

- Do not expose PostgreSQL port `5432` publicly unless your provider requires it.
- Prefer TLS (`sslmode=require`) for remote databases.
- Keep `.env`, `db-server/.env`, and `.local/database-connection.local.md`
  private.