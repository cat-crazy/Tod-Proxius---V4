const express = require('express');
const { createProxyServer } = require('http-proxy');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

if (!ADMIN_TOKEN) {
  console.error('ERROR: ADMIN_TOKEN is not set. Set ADMIN_TOKEN in environment before starting.');
  process.exit(1);
}

const app = express();
app.use(morgan('tiny'));
app.use(express.json());
app.use(cors()); // UI will call API from same Codespace URL

// In-memory configuration for this Codespace instance.
// Each Codespace user gets their own instance with its own ADMIN_TOKEN.
let config = {
  target: null // e.g. "https://example.com"
};

// Simple auth middleware for admin actions
function requireAdminToken(req, res, next) {
  const header = req.get('x-admin-token') || req.get('authorization');
  if (!header) return res.status(401).json({ error: 'missing token' });
  // support "Bearer <token>" or raw header
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'invalid token' });
  next();
}

// Validate basic http(s) URL
function validateHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Set the upstream target for this proxy instance
app.post('/api/config', requireAdminToken, (req, res) => {
  const { target } = req.body;
  if (!target || !validateHttpUrl(target)) {
    return res.status(400).json({ error: 'Invalid or missing target. Must be a full http(s) URL.' });
  }
  config.target = target;
  console.log(`Configured proxy target => ${target}`);
  res.json({
    message: 'target set',
    proxyPath: '/p/',
    target
  });
});

app.get('/api/status', requireAdminToken, (req, res) => {
  res.json({
    configured: !!config.target,
    target: config.target || null
  });
});

// Static frontend
app.use('/', express.static(path.join(__dirname, 'public')));

// Proxying handler - only allow proxying if config.target is set.
// Proxies any path under /p/* to the configured target, preserving path after /p
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
  if (!config.target) {
    return res.status(404).json({ error: 'No target configured. Use /api/config with x-admin-token.' });
  }
  // Build target URL: target + req.originalUrl after /p
  const originalPath = req.originalUrl.replace(/^\/p/, '') || '/';
  const targetUrl = new URL(config.target);
  // Combine paths
  // If target has a pathname, combine them
  let combinedPath = '';
  if (targetUrl.pathname && targetUrl.pathname !== '/') {
    combinedPath += targetUrl.pathname.replace(/\/$/, '');
  }
  combinedPath += originalPath;
  const proxyTarget = `${targetUrl.protocol}//${targetUrl.host}${combinedPath}`;
  // Use http-proxy to forward
  proxy.web(req, res, { target: proxyTarget, changeOrigin: true, selfHandleResponse: false });
});

// Fallback route
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Codespace proxy server listening on port ${PORT}`);
  console.log(`Visit / to open the UI. Configure via POST /api/config with x-admin-token header.`);
});
