```markdown
# Codespace Proxy Starter — UPDATED (Super-easy ADMIN_TOKEN setup)

This repo runs a small private proxy inside a GitHub Codespace. Each Codespace gets its own instance and you must have an ADMIN_TOKEN so only *you* can configure the proxy target.

I made setup extremely easy: if ADMIN_TOKEN is not already set in the environment, the web UI includes a one-click/one-paste setup flow that writes a `.env` file for you and activates the token immediately — no manual file editing required.

WARNING: Do NOT commit `.env` or your ADMIN_TOKEN to git. Treat it like any secret.

---

## Quickest path — really easy (download index.html or open the Codespace preview)

1. Open the repo in a GitHub Codespace or run locally:
   npm install
   npm start

2. Open the forwarded web preview (port 8080) and visit `/`:
   - If you haven't set ADMIN_TOKEN in the environment, the UI will show a big "SETUP" box.
   - Click "Generate token" or paste one you created yourself.
   - Click "Save Admin Token to Server (.env)" — the server will create a `.env`, activate the token immediately (no restart required), and enable the admin controls.

3. Now paste the token into the "Admin token" field (the UI auto-fills on success) and add the upstream target URL.
   - Click "Configure Proxy".
   - After configuration, `/p/your/path` will proxy to the configured upstream.

---

## Why this is safe-ish and what to watch for

- The convenience setup endpoint (/api/setup) is only available when no ADMIN_TOKEN is set. Once a token exists, setup is disabled.
- The server writes a `.env` file in the working directory with the token. This makes the value persistent across restarts but also means you must NOT commit `.env` to git.
- For production or shared publicly exposed services, set ADMIN_TOKEN via Codespaces environment or a secret store and avoid writing tokens into files.
- This starter is intended for private, per-Codespace use. Add host whitelisting, rate-limits, and logging before exposing.

---

## Commands / copy-paste (super short)

Generate a token:
openssl rand -hex 32
or
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"

Start:
npm install
npm start

If you run locally you can also POST setup with curl (only when no token exists yet):
curl -X POST http://localhost:8080/api/setup -H "Content-Type: application/json" -d '{"newToken":"PASTE_TOKEN_HERE"}'

Then configure:
curl -X POST http://localhost:8080/api/config -H "Content-Type: application/json" -H "x-admin-token: PASTE_TOKEN_HERE" -d '{"target":"https://example.com"}'

Check:
curl -H "x-admin-token: PASTE_TOKEN_HERE" http://localhost:8080/api/status

---

## Extra safety tips
- Add `.env` to `.gitignore` (if not already).
- Only share your Codespace port with people you trust.
- Add allowed-hosts validation and rate-limiting before exposing publicly.

```
