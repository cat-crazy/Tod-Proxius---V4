const express = require('express');
const { createProxyServer } = require('http-proxy');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const ADMIN_MODE = Boolean(ADMIN_TOKEN);

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
  "ADMIN_TOKEN is NOT set for this Codespace / server process.",
  "",
  "You must set a strong ADMIN_TOKEN environment variable to configure the proxy.",
  "Example token generation commands:",
  "  # OpenSSL (Unix/macOS):",
  "  openssl rand -hex 32",
  "  # Python:",
  "  python3 -c \"import secrets; print(secrets.token_urlsafe(32))\"",
  "  # Node:",
  "  node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\"",
  "",
  "How to set it:",
  "  - Create a .env file in the Codespace (DO NOT commit it):",
  "      ADMIN_TOKEN=your-generated-token",
  "      PORT=8080",
  "    Then restart the server (npm start).",
  "  - OR set the Codespaces Environment variable / Secrets for the Codespace before starting.",
  "",
  "Once ADMIN_TOKEN is set in the environment, restart this process and you can configure the proxy via:",
  "  curl -X POST https://<your-codespace-url>/api/config \\",
  "    -H \"Content-Type: application/json\" \\",
  "    -H \"x-admin-token: YOUR_ADMIN_TOKEN\" \\",
  "    -d '{\"target\":\"https://example.com\"}'",
  ""
];

// If ADMIN_TOKEN missing, print big instructions but keep server running in a safe read-only mode.
if (!ADMIN_MODE) {
  console.error("\n**************************************************************************");
  console.error("*** WARNING: ADMIN_TOKEN is not set. Server will run in read-only mode. ***");
  console.error("**************************************************************************\n");
  ADMIN_INSTRUCTIONS.forEach(line => console.error(line));
  console.error("\nThe server will not accept /api/config or proxying until ADMIN_TOKEN is set and the process is restarted.\n");
} else {
  console.log('ADMIN_TOKEN is set. Admin endpoints are enabled.');
}

function requireAdminToken(req, res, next) {
  if (!ADMIN_MODE) {
    // clear, helpful message for callers
    return res.status(503).json({
      error: 'admin_token_not_set',
      message: 'ADMIN_TOKEN environment variable is not set on the server. See GET /api/info for setup instructions.'
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

// Public info endpoint so the UI can detect missing ADMIN_TOKEN and show instructions
app.get('/api/info', (req, res) => {
  res.json({
    adminConfigured: ADMIN_MODE,
    configuredTarget: !!config.target,
    target: config.target || null,
    instructions: ADMIN_MODE ? null : ADMIN_INSTRUCTIONS.join('\n')
  });
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
  if (!ADMIN_MODE) {
    // Very explicit error when ADMIN_TOKEN missing
    return res.status(503).json({
      error: 'admin_token_not_set',
      message: 'Proxying is disabled because ADMIN_TOKEN environment variable is not set on the server. See /api/info for instructions.'
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
  console.log(`Open / to view the UI. If ADMIN_TOKEN is set the admin endpoints are /api/config and /api/status.`);
  if (!ADMIN_MODE) {
    console.log('\nADMIN_TOKEN is NOT set. The UI will show setup instructions. Set ADMIN_TOKEN in environment and restart to enable admin actions.\n');
  }
});
