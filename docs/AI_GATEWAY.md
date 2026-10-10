# AI Gateway

The browser sends AI tasks to a Supabase Edge Function. Store Gemini credentials only in Supabase Function secrets; never expose them in Vite variables or client code.

## Deploy

```sh
supabase login
supabase link --project-ref <ref>
supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=... ALLOWED_ORIGINS=https://<your-domain>,http://localhost:3000
supabase functions deploy ai-gateway
```

Apply the database migration before deploying the function:

```sh
supabase db push
```

The function uses Supabase's injected `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must remain in the Edge Function environment and is never configured in this repository or shipped to clients.

## Local development

Create `supabase/.env.local`:

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.8-flash
ALLOWED_ORIGINS=http://localhost:3000
```

Start the local Supabase stack and serve the function:

```sh
supabase start
supabase functions serve ai-gateway --env-file supabase/.env.local
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the app's `.env.local` to the local Supabase URL and anon key. Never use `VITE_` for Gemini credentials.
