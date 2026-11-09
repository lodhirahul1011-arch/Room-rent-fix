# RoomRent — B8 integrated frontend and backend

This project combines the **Phase 8 Next.js frontend** and **B7 Express/Mongoose backend**. It preserves two intentionally separate front-end modes:

- `NEXT_PUBLIC_ROOMRENT_API_MODE=mock`: existing browser-only demonstration (default).
- `NEXT_PUBLIC_ROOMRENT_API_MODE=live`: real authenticated HTTP APIs and MongoDB data. Browser mock records are **not** migrated.

**Scope limitation:** This is a B8 integration/developer build, not an independently verified production deployment. B6 platform-admin/subscription workflows and real WebRTC/video/call-concurrency tests are not included. A few Phase 7 screens are demo-only in mock mode. Never use this build with real tenant identity documents until security, storage, and integration tests are completed.

## Folder structure

```text
roomrent/
  frontend/            Next.js App Router, UI, live API client, legacy mock modules
  backend/             Node.js/Express, MongoDB models, routes, auth, finance, workers
  scripts/
    b8-static-qa.cjs     Dependency-free source contract checks
  docs/
    B8_INTEGRATION_REPORT.md
    B8_SECURITY_AND_RELEASE_CHECKLIST.md
    ROOMRENT_MASTER_QA_REPORT.md
  compose.local.yml     Local MongoDB replica set service
```

## Local startup (Node 22 recommended)

1. Install Docker, Node.js, and npm. Start a MongoDB **replica set**, required for registration, approval and financial transactions.
2. From the repository root, run `docker compose -f compose.local.yml up -d` (or start your own MongoDB replica set). For a new local Mongo volume, initialize once:
   `docker compose -f compose.local.yml exec mongo mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'`.
   Wait until it reports a primary. Docker networking configurations may require a different replica-set host address.
3. `cp backend/.env.example backend/.env`. Replace `JWT_SECRET` with a securely generated 32+ character random secret and set `MONGODB_URI=mongodb://127.0.0.1:27017/roomrent?replicaSet=rs0&directConnection=true`.
4. `cp frontend/.env.example frontend/.env.local`. Set `NEXT_PUBLIC_ROOMRENT_API_MODE=live` and `NEXT_PUBLIC_ROOMRENT_API_URL=http://localhost:5000`.
5. `npm --prefix backend install` and `npm --prefix frontend install`.
6. Start backend with `npm run dev:backend` and frontend in a separate terminal with `npm run dev:frontend` (or root `npm run dev`).
7. Check `http://localhost:5000/api/health` and `http://localhost:3000/login`.

### Support email

The admin Support page submits tickets to `POST /api/support/tickets`. Configure `RESEND_API_KEY`, `RESEND_TEMPLATE_ID`, `RESEND_FROM_EMAIL`, and `CONTACT_EMAIL` in `backend/.env`. The Resend template used for the support inbox should define these variables: `ticketId`, `name`, `email`, `phone`, `subject`, `category`, `message`, and `submittedAt`. The submitter receives a separate confirmation email. The endpoint is rate-limited and reports when support delivery or confirmation delivery fails.

To run support email locally without MongoDB, start `npm run dev:support` from `backend/`. This starts only the health and support endpoints on port 5000; use `npm run dev` when MongoDB is available for the full backend. Allow both `http://localhost:3000` and `http://127.0.0.1:3000` in `CORS_ORIGINS` for local browser development.

The owner must create a property and enable **Accept new tenant applications** before tenant enrollment. The owner then adds a floor and room. A registered tenant applies via the catalogue, the owner approves, and **the tenant must sign out and log back in** to obtain the newly linked membership/session. Next create monthly invoices and record/verify an external payment.

No actual payment gateway is implemented. Payments remain manually verified, and the tenant payment-proof flow currently stores metadata **not the file bytes**.

## Commands

```sh
npm run qa:static
npm run test:backend
npm --prefix backend run test:b8   # requires B8_TEST_MONGO_URI dedicated local replica-set test DB
npm run typecheck
npm --prefix frontend run lint
npm run test:frontend
npm run build:frontend
npm --prefix frontend run test:e2e
```

The integration test must use a disposable `roomrent_b8_test` database; it drops the database for isolation and intentionally refuses remote Atlas URIs. Example:

```sh
B8_TEST_MONGO_URI='mongodb://127.0.0.1:27017/roomrent_b8_test?replicaSet=rs0&directConnection=true' npm run test:integration
```

`npm install`/`npm ci`, Next.js build, browser E2E and MongoDB integration require network availability or a preinstalled/cached dependency tree and running infrastructure. They have not passed in this artifact-build environment.

## Important security and delivery notes

- Demo mode has no server-enforced roles; never deploy it as a real tenant service.
- Live mode has backend session/membership authorization, but access/refresh tokens currently live in browser `sessionStorage`. Replace this with secure HttpOnly cookie-based session handling plus CSRF controls before a public production launch.
- Sensitive file storage currently uses a private local disk location. Before launch, implement private object storage, antivirus scanning, encryption/retention policies, monitoring and backups.
- Production rollout must include credential hardening, session replay review, real document upload authorization testing, PDF access controls, audit review and rate-limit/load testing.
- Platform-admin subscription/approval APIs belong to **B6, which was not implemented** before B7. Live screens do not falsely claim those APIs work.
- Real two-device WebRTC, TURN, reconnection and concurrent-call testing were intentionally deferred by the user.

See `docs/B8_INTEGRATION_REPORT.md` and `docs/B8_SECURITY_AND_RELEASE_CHECKLIST.md` for the detailed feature map and go/no-go criteria.
