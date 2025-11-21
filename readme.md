# Codespace Proxy Starter

This repo is a minimal starter for running a private proxy inside a GitHub Codespace. Each person who creates a Codespace from this repo can configure their own upstream target and use the Codespace-forwarded port as their private proxy endpoint.

Features
- Single upstream target per Codespace (simple, less risk of open proxy).
- ADMIN_TOKEN is required to configure the target.
- Frontend UI with a Chrome/Spotify/Tor-inspired look & feel to make setup easy.

Getting started (quick)
1. Fork this repository and open it in a GitHub Codespace.
2. In the Codespace, set an environment variable `ADMIN_TOKEN` (in Codespaces you can set this via the Codespace "Environment variables" UI or create a .env file).
   - Example .env (copy from .env.example):
     ADMIN_TOKEN=your-strong-secret
3. Start the server:
   npm install
   npm start
4. Expose port 8080 in Codespaces (Ports view) and open it in browser. The UI is served at `/`.
5. In the UI, set the upstream target (for example `https://example.com`) — this requires the ADMIN_TOKEN.
   - The server will return the proxy base path (`/p/`). Any request to `/p/<path>` will be forwarded to `https://example.com/<path>`.

Security & responsible use
- Do NOT run this as an open, unauthenticated public proxy. Keep ADMIN_TOKEN secret, and optionally restrict allowed upstream hosts in the code.
- Add logging, rate-limiting, allowed-host checks, and TLS termination where appropriate for production.
- Avoid using this to access services you don't have permission to access.

How it works
- POST /api/config { target: "https://site.example" } with header `x-admin-token: <ADMIN_TOKEN>`
  - Sets the upstream target for this Codespace instance.
- Any requests to /p/* will be forwarded to the configured upstream.
- UI is static files in `public/`.

Development
- Use `npm run dev` to run with nodemon.
- The repository includes a .devcontainer to make Codespaces experience smoother.

Extending
- Add allowed hosts validation to /api/config.
- Add basic auth / per-path mapping for multiple upstreams.
- Add TLS in front (or use Codespaces built-in HTTPS forwarding where available).
- Add rate-limits and access logs before sharing the public port.

License: MIT
