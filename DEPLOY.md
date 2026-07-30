# Deploying to Coolify (Hostinger VPS)

Two separate Coolify resources, both built from this one GitHub repo
(`Davedave001/zacca-x-402-hedera`), each with its own Dockerfile and domain.

| Resource | Domain | Dockerfile | Build context |
|---|---|---|---|
| Backend (API) | `pay-api.zacca.ai` | `Dockerfile` (repo root) | `/` (repo root) |
| Frontend (UI) | `pay.zacca.ai` | `frontend/Dockerfile` | `/frontend` |

Local smoke test before deploying either one: `docker compose up --build`,
then open `http://localhost:8080` (frontend) and
`http://localhost:4021/catalog` (backend).

## 1. Backend — `pay-api.zacca.ai`

1. Coolify → **New Resource → Application → Dockerfile** (or "Docker Compose"
   if you'd rather deploy both from `docker-compose.yml` — the steps below
   assume two separate Dockerfile resources, matching the two-domain ask).
2. **Source**: this GitHub repo, branch `master`.
3. **Base Directory / Build Context**: `/` (repo root).
4. **Dockerfile Location**: `Dockerfile`.
5. **Port**: `4021` (matches `EXPOSE 4021` in the Dockerfile).
6. **Domain**: `pay-api.zacca.ai`. Coolify issues the Let's Encrypt cert
   automatically once DNS points at the VPS.
7. **Environment variables** — copy from your local `.env`, with real
   secrets pasted directly into Coolify's env editor, not committed anywhere:
   ```
   HEDERA_NETWORK=hedera:testnet
   FACILITATOR_URL=https://api.testnet.blocky402.com
   PAY_TO_ACCOUNT=<your PAY_TO_ACCOUNT, distinct from any payer account>
   DATA_PROVIDER=zacca-decentralized
   PORT=4021
   CORS_ORIGIN=https://pay.zacca.ai
   HEDERA_JSON_RPC_URL=https://testnet.hashio.io/api
   HEDERA_TESTNET_DEPLOYER_KEY=<ECDSA key -- see contracts/README.md>
   ```
   `HEDERA_CLIENT_ID` / `HEDERA_CLIENT_KEY` are only used by the local
   `scripts/e2e-pay.ts` demo script, not by the deployed server itself --
   no need to set them here.
8. **Deploy**. Check the build log for `npm ci` / `npm start` succeeding,
   then hit `https://pay-api.zacca.ai/catalog` -- should return the live
   catalog JSON.

## 2. Frontend — `pay.zacca.ai`

1. Coolify → **New Resource → Application → Dockerfile**.
2. **Source**: same repo, branch `master`.
3. **Base Directory / Build Context**: `/frontend`.
4. **Dockerfile Location**: `frontend/Dockerfile`.
5. **Port**: `80` (nginx).
6. **Domain**: `pay.zacca.ai`.
7. **Build argument**: `VITE_API_BASE_URL=https://pay-api.zacca.ai` -- this
   is a *build-time* arg (Vite bakes `import.meta.env.VITE_*` into the
   bundle at build, not runtime), so set it under Coolify's "Build Args" /
   "Docker Build Variables" section, not the regular runtime env vars list.
8. **Deploy**. Once live, open `https://pay.zacca.ai` and confirm:
   - The "Live catalog" section loads real data from `pay-api.zacca.ai`
     (open devtools Network tab and check the `/catalog` request succeeds,
     not blocked by CORS).
   - "Try it live" can reach the backend (paste a funded testnet key to
     actually exercise it end-to-end).

## Deploy order & gotchas

- **Deploy the backend first.** The frontend's build bakes in
  `VITE_API_BASE_URL` at build time, so if you redeploy the backend at a
  different URL later, you must rebuild (not just restart) the frontend.
- **CORS is origin-exact.** `CORS_ORIGIN` on the backend must match the
  frontend's exact scheme+domain (`https://pay.zacca.ai`). If you test with
  `www.pay.zacca.ai` or `http://` instead of `https://`, add that origin too
  (comma-separated, see `src/server/config.ts`).
- **`contracts/deployments/hederaTestnet.json` must exist in the repo** at
  deploy time -- it's committed (no secrets in it, just contract addresses),
  and the backend Dockerfile copies it in explicitly. If you ever redeploy
  the contracts to a new address, commit the updated file before
  redeploying the backend.
- **DNS**: point both `pay.zacca.ai` and `pay-api.zacca.ai` A/CNAME records
  at your Hostinger VPS's IP before deploying, so Coolify's automatic
  Let's Encrypt issuance succeeds on first deploy.
- **This is testnet.** `HEDERA_TESTNET_DEPLOYER_KEY` and the on-chain data
  behind these domains are testnet-only -- no real funds are at risk, but
  the deployer key still shouldn't be committed anywhere (it isn't --
  `.env`/`contracts/.env` are gitignored).
