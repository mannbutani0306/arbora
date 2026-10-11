# Production deployment

This guide deploys the static frontend to Vercel, uses Supabase for auth and the
AI gateway, and optionally connects the Arbora-T5 Hugging Face Space. Do not
commit credentials or put private keys in `VITE_` variables. The Supabase anon
key is intentionally public and protected by Supabase RLS; the service-role,
Gemini, model, and Hugging Face tokens are server-side secrets only.

## 1. Prepare Supabase

1. Create or select a production Supabase project and apply the tracked
   migrations. Review existing table policies before applying any migration
   that alters RLS. Confirm the `analyses`, `benchmark_runs`, `repair_events`,
   `samples`, `model_evaluations`, and `ai_usage` schemas match the application.
2. In **Authentication → URL Configuration**, set **Site URL** to the
   production origin (for example `https://arbora.vercel.app`). Add the exact
   production callback destinations to **Redirect URLs**, including
   `/history` and `/auth` as used by the app. Add localhost only for development.
3. Choose the **Confirm email** setting under **Authentication → Providers →
   Email**. Enable confirmation for a public production app if email ownership
   must be verified; configure SMTP and test the confirmation link before
   enabling it. Ensure its redirect URL is allow-listed.
4. For Google OAuth, create a Web OAuth client in Google Cloud. Set its
   authorized redirect URI to
   `https://<project-ref>.supabase.co/auth/v1/callback`, enable Google in
   Supabase's Auth provider settings, and enter the client ID and secret in the
   Supabase dashboard. Add the production site URL to the OAuth consent screen's
   authorized domains. Never put the Google client secret in this repository.
5. Deploy the Edge Function and set server-side secrets from a secure shell or
   secret manager. The command below uses environment-variable references; do
   not paste literal secret values into shell history or commit them:

   ```sh
   supabase functions deploy ai-gateway
   supabase secrets set \
     GEMINI_API_KEY="$GEMINI_API_KEY" \
     GEMINI_MODEL="$GEMINI_MODEL" \
     SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
     ALLOWED_ORIGINS="https://arbora.vercel.app" \
     ARBORA_MODEL_URL="$ARBORA_MODEL_URL" \
     ARBORA_MODEL_TOKEN="$ARBORA_MODEL_TOKEN"
   ```

   `ARBORA_MODEL_URL` and `ARBORA_MODEL_TOKEN` are needed for the hosted
   Arbora-T5 engine. Omit optional values only when that engine is not deployed.
   Do not expose the service-role, Gemini, or model token as a frontend variable.
6. The gateway stores hourly rate-limit counters in `public.ai_usage`. Enable
   `pg_cron` in **Database → Extensions**, then schedule daily removal of
   counters older than 24 hours:

   ```sql
   select cron.schedule(
     'purge-old-ai-usage',
     '17 3 * * *',
     $$delete from public.ai_usage
       where window_started_at < date_trunc('hour', now()) - interval '24 hours'$$
   );
   ```

   Verify the job in `cron.job` and monitor `cron.job_run_details`. Keep the
   current and preceding rate-limit windows; do not truncate the table while
   requests are being served.
7. Configure automated database backups and point-in-time recovery according
   to the production project's plan and required retention. Perform a restore
   drill before relying on backups.
8. Run the RLS checks against the local Supabase stack before production
   rollout:

   ```sh
   supabase start
   supabase test db
   ```

   Review the SQL test setup and confirm it exercises the same policies and
   migrations that will be applied in production. Never use production user
   data to run destructive tests.

## 2. Deploy the frontend to Vercel

1. Import the GitHub repository into Vercel, set the production branch to
   `main`, and configure the custom domain if desired. The checked-in
   `vercel.json` provides SPA rewrites, security headers, and immutable caching
   for Vite's content-hashed assets.
2. Set only these frontend build variables in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - Optional `VITE_SENTRY_DSN` for client error reporting

   The anon key is public by design. Do not add service-role, Gemini, model,
   OAuth client-secret, or Hugging Face credentials to Vercel frontend
   variables.
3. In GitHub Actions, configure the `production` environment with secrets
   `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
   `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`. Add
   `VITE_SENTRY_DSN` only if used. Add the environment variable
   `PRODUCTION_URL` containing the deployed origin. The main-branch deploy job
   runs only after typecheck, lint, coverage, Deno, build, bundle scan,
   Playwright, and Lighthouse checks pass.
4. If using a custom domain, update the canonical URL and sitemap/robots host
   in `index.html`, `public/sitemap.xml`, and `public/robots.txt` before
   publishing. The current metadata uses `https://arbora.vercel.app`.
5. The home page should return HTTP 200, and unknown application routes should
   serve the SPA shell so the friendly in-app 404 can render.

## 3. Optional Sentry

Create a browser project in Sentry and set `VITE_SENTRY_DSN` in Vercel and the
GitHub `production` environment. The client SDK is loaded only when the DSN is
present, disables default PII, and sends no performance traces. Without a DSN,
client error details are logged only in development. The gateway logs structured
task, status, and duration fields; it must never log source text, prompts,
authorization headers, or environment-variable values.

## 4. Optional Arbora-T5 model service

Deploy the FastAPI container as a Docker Hugging Face Space and follow
[`MODEL_SERVING.md`](./MODEL_SERVING.md). Set its model repository IDs and
optional private-repository token as Space secrets. Set `ARBORA_MODEL_URL` and
optional `ARBORA_MODEL_TOKEN` as Supabase Edge Function secrets, then redeploy
the gateway. A cold Space reports a retryable `MODEL_COLD_START`; the UI must
not claim a model result was verified until the local parser confirms it.

## 5. Local Docker Compose

Install Docker Desktop, then set deployment/model variables in the current
PowerShell session (do not save real credentials in a checked-in file):

```powershell
$env:VITE_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:VITE_SUPABASE_ANON_KEY = "<public-anon-key>"
$env:HF_REPO_REPAIR = "<owner/repair-model>"
$env:HF_REPO_AST = "<owner/ast-model>"
docker compose up --build
```

The frontend is at `http://localhost:8080` and the model API at
`http://localhost:7860`. Set optional `HF_TOKEN` or `ARBORA_MODEL_TOKEN` in the
same shell for private models. The Compose model service downloads both model
checkpoints at startup and may require substantial RAM and disk. To use the
local model through the browser, run a local Supabase Edge Runtime and set its
`ARBORA_MODEL_URL` to a URL reachable from that runtime; the hosted gateway
cannot reach a developer's `localhost`.

## 6. Post-deploy smoke check

The workflow runs `npm run smoke` after deployment. To run it manually, set
`SMOKE_BASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` in the shell and run:

```sh
npm ci
npm run smoke
```

It checks the frontend, `/functions/v1/ai-gateway/health`, and one schema-valid
repair request. It retries once after the gateway's explicit 20-second
`MODEL_COLD_START` response. Do not treat a successful HTTP response alone as
proof that a repair is correct; candidate verification remains client-side.

## 7. Releases and dependencies

Dependabot checks npm and Python dependencies weekly. Run the **Release**
workflow manually with a `vMAJOR.MINOR.PATCH` tag to generate GitHub release
notes from merged changes. Review dependency alerts and generated notes before
publishing each production release.
