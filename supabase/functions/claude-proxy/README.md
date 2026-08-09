# claude-proxy Edge Function

Forwards `POST` requests from the Lendaro frontend to the Anthropic Messages
API with the API key attached server-side. Without this, the only alternative
is shipping `VITE_ANTHROPIC_KEY` to every browser — which leaks the key to
anyone who opens DevTools.

## Deploy

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy claude-proxy
```

## Wire up the frontend

In production `.env`:

```
VITE_CLAUDE_PROXY_URL=https://<your-project-ref>.functions.supabase.co/claude-proxy
# Leave VITE_ANTHROPIC_KEY blank in production.
```

`callClaude()` in `src/App.jsx` already prefers `VITE_CLAUDE_PROXY_URL` when
set, and falls back to the direct browser call only for local dev.

## Hardening

The function:

- Caps `max_tokens` at 2000 to limit cost from any single request.
- Validates the JSON body shape (`model`, `system`, `messages`).
- Honours an allow-list of origins for CORS — edit `ALLOWED_ORIGINS` in
  `index.ts` before deploying.
- Inherits Supabase's default JWT verification, so only signed-in users
  can call it. Disable that in `supabase/config.toml` only if you know
  what you're doing.
