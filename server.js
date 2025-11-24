// server.js
// Codespace proxy server with editable ADMIN_TOKEN options.
// WARNING: Changing the token in this file is simple but insecure if you commit it.
// DO NOT commit a real secret to your repo. Use .env or Codespaces secrets for real use.

const express = require('express');
const { createProxyServer } = require('http-proxy');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

// HOW TO CHANGE THE TOKEN (pick one):
// 1) Preferred & persistent: set ADMIN_TOKEN in the environment (.env or Codespaces env) and restart the process.
//    Example .env:
//      ADMIN_TOKEN=your-generated-token
//      PORT=8080
// 2) Quick edit: directly change the fallbackToken string below and restart the process.
//    (Only do this in a private Codespace and DO NOT commit the change.)
// 3) Runtime change (temporary, in-memory): call POST /api/change-admin-token with current token + newToken (only works while server runs).

// Fallback token (file-editable). Change this string in server.js if you prefer editing the file.
// NOTE: DO NOT commit a real secret to your repo. This fallback is for convenience only.
const fallbackToken = 'changeme-REPLACE_THIS';

// The server will prefer environment ADMIN_TOKEN; if not present it will use fallbackToken.
// This variable is mutable so we can change it at runtime via the protected endpoint.
let ADMIN_TOKEN = process.env.ADMIN_TOKEN || fallbackToken;

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const ADMIN_MODE = Boolean(ADMIN_TOKEN && ADMIN_TOKEN !== '');

const app = express();
app.use(morgan('tiny'));
app.use(express.json());
app.use(cors()); // UI will call API from same Codespace URL

// In-memory configuration for this Codespace instance.
let config = {
  target: null // e.g. "https://example.com"
};

// Helpful instructions for people who forgot to set ADMIN_TOKEN
const ADMIN_INSTRUCTIONS = [
  "ADMIN_TOKEN is not set via environment. The server is using the fallback token in server.js.",
  "",
  "You can change the token in one of these ways:",
  "  1) Set ADMIN_TOKEN in the environment (.env or Codespaces environment) and restart (recommended).",
  "  2) Edit server.js and change the fallbackToken value, then restart the server (quick but DON'T commit).",
  "  3) Change it at runtime (temporary): POST /api/change-admin-token with the current token (see below).",
  "",
  "To generate a token, use:",
  "  openssl rand -hex 32",
  "  python3 -c \"import secrets; print(secrets.token_urlsafe(32))\"",
  ""
];

if (!process.env.ADMIN_TOKEN) {
  console.error("\n*** WARNING: ADMIN_TOKEN not set in environment. Using fallbackToken from server.js. ***");
  console.error("If you're testing locally this is OK; for anything public set ADMIN_TOKEN via environment and restart.");
  ADMIN_INSTRUCTIONS.forEach(line => console.error(line));
} else {
  console.log('ADMIN_TOKEN found in environment. Admin endpoints enabled.');
}

// Middleware: require the current admin token
function requireAdminToken(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({
      error: 'admin_token_not_set',
      message: 'ADMIN_TOKEN is not set on the server. See GET /api/info for setup instructions.'
    });
  }

  const header = req.get('x-admin-token') || req.get('authorization');
  if (!header) return res.status(401).json({ error: 'missing_token', message: 'Missing x-admin-token or Authorization header.' });
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'invalid_token', message: 'Provided token is invalid.' });
  next();
}

function validateHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Public info endpoint — useful for UI to detect admin presence and origin of token
app.get('/api/info', (req, res) => {
  res.json({
    adminConfigured: Boolean(process.env.ADMIN_TOKEN),
    usingFallbackToken: !Boolean(process.env.ADMIN_TOKEN),
    configuredTarget: !!config.target,
    target: config.target || null,
    instructions: (!process.env.ADMIN_TOKEN) ? ADMIN_INSTRUCTIONS.join('\n') : null,
    note: 'If using fallbackToken (editable in server.js), change it here and restart to persist, or use /api/change-admin-token to change in-memory (temporary).'
  });
});

// Endpoint to change the admin token at runtime (in-memory only)
// Security: requires the current valid token in x-admin-token (or Authorization).
// WARNING: This change is not persisted to disk — a server restart will revert to the env or fallbackToken value.
app.post('/api/change-admin-token', requireAdminToken, (req, res) => {
  const { newToken } = req.body;
  if (!newToken || typeof newToken !== 'string' || newToken.length < 16) {
    return res.status(400).json({ error: 'invalid_new_token', message: 'newToken required (string, min length 16).' });
  }
  ADMIN_TOKEN = newToken;
  console.log('ADMIN_TOKEN was changed at runtime (in-memory). Remember this is not persisted across restarts.');
  res.json({ message: 'admin_token_changed_in_memory', note: 'This change is temporary and will be lost on restart.' });
});

// Set the upstream target for this proxy instance (admin only)
app.post('/api/config', requireAdminToken, (req, res) => {
  const { target } = req.body;
  if (!target || !validateHttpUrl(target)) {
    return res.status(400).json({ error: 'invalid_target', message: 'Invalid or missing target. Must be a full http(s) URL.' });
  }
  config.target = target;
  console.log(`Configured proxy target => ${target}`);
  res.json({
    message: 'target set',
    proxyPath: '/p/',
    target
  });
});

// Check status (admin only)
app.get('/api/status', requireAdminToken, (req, res) => {
  res.json({
    configured: !!config.target,
    target: config.target || null
  });
});

// Static frontend
app.use('/', express.static(path.join(__dirname, 'public')));

// Proxying handler - only allow proxying if config.target is set.
const proxy = createProxyServer({});
proxy.on('error', (err, req, res) => {
  console.error('Proxy error', err && err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
  }
  try {
    res.end(JSON.stringify({ error: 'proxy_error', message: err && err.message }));
  } catch (e) {
    // ignore
  }
});

app.use('/p', (req, res) => {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({
      error: 'admin_token_not_set',
      message: 'Proxying is disabled because ADMIN_TOKEN is not set on the server. See /api/info for instructions.'
    });
  }
  if (!config.target) {
    return res.status(404).json({
      error: 'no_target_configured',
      message: 'No upstream target configured. Use POST /api/config with header x-admin-token: <ADMIN_TOKEN>.'
    });
  }

  const originalPath = req.originalUrl.replace(/^\/p/, '') || '/';
  const targetUrl = new URL(config.target);
  let combinedPath = '';
  if (targetUrl.pathname && targetUrl.pathname !== '/') {
    combinedPath += targetUrl.pathname.replace(/\/$/, '');
  }
  combinedPath += originalPath;
  const proxyTarget = `${targetUrl.protocol}//${targetUrl.host}${combinedPath}`;

  proxy.web(req, res, { target: proxyTarget, changeOrigin: true, selfHandleResponse: false });
});

// Fallback route
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Codespace proxy server listening on port ${PORT}`);
  console.log(`Open / to view the UI. If ADMIN_TOKEN is set in environment, admin endpoints are enabled.`);
  if (!process.env.ADMIN_TOKEN) {
    console.log('\nNOTE: ADMIN_TOKEN was NOT set via environment. The server is using fallbackToken from server.js.');
    console.log('Edit fallbackToken in server.js or set ADMIN_TOKEN in .env/Codespaces env and restart to persist a new token.\n');
  }
});
