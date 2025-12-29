# Backend Starter (NestJS)

This is a starter backend structure aligned with Play Store / App Store needs:
- Secure headers (helmet)
- ValidationPipe (whitelist + transform)
- Global prefix `/api`
- Health endpoint: `GET /api/health`

## Run
```bash
npm install
npm run start:dev
```

## Build & Start (prod)
```bash
npm run build
npm run prod
```

## Environment
Copy `.env.example` → `.env` and set values.

## Next recommended additions
- Database module (Postgres via Prisma or TypeORM)
- Refresh token / session management
- Rate limiting per route (throttler)
- Audit logs for account deletion and exports
