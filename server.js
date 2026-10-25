// Défilé Studio — serveur MCP pour ChatGPT (aucune dépendance, Node 18+)
// Transport : MCP "streamable HTTP" sur POST /mcp, réponses JSON.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const WIDGET_URI = 'ui://defile/studio-v1.html';
const WIDGET_HTML = fs.readFileSync(path.join(__dirname, 'widget.html'), 'utf8');
const SERVER_INFO = { name: 'defile-studio', title: 'Défilé Studio', version: '1.0.0' };

const TYPES = ['bar', 'line', 'table', 'bubble', 'treemap', 'pie', 'barline', 'compare', 'compare2', 'versus', 'bar3d', 'tournament', 'scroll', 'wheel', 'size'];
const PLATFORMS = ['youtube', 'shorts', 'tiktok', 'reels', 'igpost', 'facebook', 'x', 'linkedin'];

const CSP = {
  connectDomains: ['https://cdn.jsdelivr.net', 'https://unpkg.com'],
  resourceDomains: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://unpkg.com'],
};

const UI_META = {
  ui: { resourceUri: WIDGET_URI },
  'openai/outputTemplate': WIDGET_URI,
  'openai/widgetAccessible': true,
};

const CREATE_DESC = `Use this when the user wants an animated data video or chart: bar chart race, ranking, top N, versus, championship/tournament, comparison, size comparison, wheel draw, or a long scrolling list (for example "the 80 richest people").
It opens the Défilé Studio editor in the conversation with the data already loaded; the user can then change styles, add photos and export an MP4.
Data rules:
- Race over time (bar, line, table, bubble, treemap, pie, barline, compare, compare2, bar3d): header = ["Date", item1, item2, …]; one row per date ["2000", v1, v2, …], chronological, ideally 5+ dates.
- versus (2–4 contenders) and tournament (any number): header = ["Criterion", contender1, contender2, …]; one row per criterion. Put criteria where lower wins in lowerBetter.
- scroll (long list): header = ["Name", "Country", other text or number columns…]; one row per person/item. A "Country"/"Pays" column shows flags.
- wheel: header = ["Name", "Weight"]; one row per item.
- size: header = ["Name", "Height"]; one row per item.
Numbers without units or thousands separators; null when unknown. suffix = the real unit (" %", " km", " goals"…), use " M" only if values really are in millions. Always cite the source. Titles in the user's language.`;

const TOOLS = [
  {
    name: 'defile_create',
    title: 'Créer une vidéo Défilé',
    description: CREATE_DESC,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: TYPES, description: 'Chart type' },
        platform: { type: 'string', enum: PLATFORMS, description: 'Target platform; sets the video format (youtube 16:9, tiktok/shorts/reels 9:16, igpost 4:5, linkedin 1:1)' },
        title: { type: 'string' },
        subtitle: { type: 'string' },
        source: { type: 'string' },
        header: { type: 'array', items: { type: 'string' }, minItems: 2 },
        rows: { type: 'array', items: { type: 'array', items: {} }, minItems: 1, description: 'Data rows; cells are strings or numbers (use null or "" when unknown)' },
        prefix: { type: 'string' },
        suffix: { type: 'string' },
        decimals: { type: 'integer', minimum: 0, maximum: 2 },
        lowerBetter: { type: 'array', items: { type: 'string' }, description: 'versus/tournament: criteria where the lowest value wins' },
        categories: { type: 'object', description: 'Optional map {itemName: category}' },
        speed: { type: 'string', enum: ['slow', 'normal', 'fast'] },
      },
      required: ['type', 'title', 'header', 'rows'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: Object.assign({}, UI_META, {
      'openai/toolInvocation/invoking': 'Préparation de la vidéo…',
      'openai/toolInvocation/invoked': 'Vidéo prête dans Défilé',
    }),
  },
  {
    name: 'defile_open',
    title: 'Ouvrir Défilé Studio',
    description: 'Use this when the user just wants to open the Défilé Studio editor (their saved projects and templates) without new data.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: Object.assign({}, UI_META, {
      'openai/toolInvocation/invoking': 'Ouverture de Défilé…',
      'openai/toolInvocation/invoked': 'Défilé Studio ouvert',
    }),
  },
];

function cleanCreate(a) {
  a = a || {};
  const header = Array.isArray(a.header) ? a.header.map((x) => String(x ?? '')).slice(0, 400) : [];
  const rows = Array.isArray(a.rows) ? a.rows.slice(0, 2000).map((r) => (Array.isArray(r) ? r.slice(0, 400).map((v) => (v == null ? '' : typeof v === 'number' ? v : String(v))) : [])) : [];
  if (header.length < 2 || !rows.length) throw new Error('header (2+ columns) and rows (1+ row) are required');
  const out = {
    action: 'create',
    type: TYPES.includes(a.type) ? a.type : 'bar',
    platform: PLATFORMS.includes(a.platform) ? a.platform : 'youtube',
    title: String(a.title || '').slice(0, 200),
    subtitle: String(a.subtitle || '').slice(0, 300),
    source: String(a.source || '').slice(0, 300),
    header, rows,
    prefix: String(a.prefix || '').slice(0, 10),
    suffix: String(a.suffix || '').slice(0, 20),
    decimals: Math.max(0, Math.min(2, parseInt(a.decimals, 10) || 0)),
  };
  if (Array.isArray(a.lowerBetter)) out.lowerBetter = a.lowerBetter.map(String).slice(0, 100);
  if (a.categories && typeof a.categories === 'object') out.categories = Object.fromEntries(Object.entries(a.categories).slice(0, 2000).map(([k, v]) => [String(k), String(v)]));
  if (['slow', 'normal', 'fast'].includes(a.speed)) out.speed = a.speed;
  return out;
}

function callTool(name, args) {
  if (name === 'defile_create') {
    const d = cleanCreate(args);
    return {
      structuredContent: d,
      content: [{ type: 'text', text: `Projet « ${d.title} » chargé dans Défilé : ${d.rows.length} lignes, type ${d.type}, format ${d.platform}. L’utilisateur peut maintenant ajuster le style, ajouter des photos et exporter la vidéo depuis l’éditeur affiché.` }],
      _meta: {},
    };
  }
  if (name === 'defile_open') {
    return { structuredContent: { action: 'open' }, content: [{ type: 'text', text: 'Défilé Studio est ouvert.' }] };
  }
  const e = new Error('Unknown tool: ' + name); e.code = -32602; throw e;
}

function handle(msg) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'].includes(params && params.protocolVersion) ? params.protocolVersion : '2025-06-18',
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Défilé Studio turns tables into animated chart videos. Call defile_create with the data; the editor opens in the conversation.',
      });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      try { return ok(callTool(params && params.name, (params && params.arguments) || {})); }
      catch (e) {
        if (e.code === -32602) return { jsonrpc: '2.0', id, error: { code: -32602, message: e.message } };
        return ok({ isError: true, content: [{ type: 'text', text: 'Erreur : ' + e.message }] });
      }
    }
    case 'resources/list':
      return ok({ resources: [{ uri: WIDGET_URI, name: 'defile-studio', title: 'Défilé Studio', mimeType: 'text/html;profile=mcp-app' }] });
    case 'resources/templates/list': return ok({ resourceTemplates: [] });
    case 'resources/read': {
      if (!params || params.uri !== WIDGET_URI) return { jsonrpc: '2.0', id, error: { code: -32002, message: 'Resource not found' } };
      return ok({
        contents: [{
          uri: WIDGET_URI,
          mimeType: 'text/html;profile=mcp-app',
          text: WIDGET_HTML,
          _meta: {
            ui: { prefersBorder: false, csp: CSP },
            'openai/widgetPrefersBorder': false,
            'openai/widgetDescription': 'Éditeur de vidéos de données animées (courses de barres, versus, championnats, défilements…).',
            'openai/widgetCSP': { connect_domains: CSP.connectDomains, resource_domains: CSP.resourceDomains },
          },
        }],
      });
    }
    case 'prompts/list': return ok({ prompts: [] });
    default:
      if (method && method.startsWith('notifications/')) return null;
      return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } };
  }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
}

const server = http.createServer((req, res) => {
  cors(res);
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  console.log(new Date().toISOString(), req.method, url.pathname, 'accept=' + (req.headers.accept || ''));
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><meta charset="utf-8"><title>Défilé Studio MCP</title><p>Serveur MCP Défilé Studio actif. Adresse à donner à ChatGPT : <code>' + (req.headers['x-forwarded-proto'] || 'http') + '://' + req.headers.host + '/mcp</code></p><p><a href="/preview">Aperçu de l’éditeur</a></p>');
  }
  if (url.pathname === '/preview' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(WIDGET_HTML);
  }
  const isMcp = ['/mcp', '/mcp/', '/sse', '/sse/'].includes(url.pathname) || (url.pathname === '/' && req.method === 'POST');
  if (!isMcp) { res.writeHead(404); return res.end('Not found'); }
  if (req.method === 'GET') { res.writeHead(405, { Allow: 'POST, DELETE' }); return res.end(); }
  if (req.method === 'DELETE') { res.writeHead(200); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 8e6) req.destroy(); });
  req.on('end', () => {
    let msg;
    try { msg = JSON.parse(body); } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
    }
    const batch = Array.isArray(msg);
    console.log('  ->', (batch ? msg : [msg]).map((m) => m && m.method).join(','));
    const replies = (batch ? msg : [msg]).map(handle).filter(Boolean);
    const headers = { 'Content-Type': 'application/json' };
    const isInit = (batch ? msg : [msg]).some((m) => m && m.method === 'initialize');
    headers['Mcp-Session-Id'] = isInit ? crypto.randomUUID() : (req.headers['mcp-session-id'] || crypto.randomUUID());
    if (!replies.length) { res.writeHead(202, headers); return res.end(); }
    const payload = JSON.stringify(batch ? replies : replies[0]);
    const accept = String(req.headers.accept || '');
    if (accept.includes('text/event-stream') && !accept.includes('application/json')) {
      headers['Content-Type'] = 'text/event-stream'; headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      return res.end('event: message\ndata: ' + payload + '\n\n');
    }
    res.writeHead(200, headers);
    res.end(payload);
  });
});

server.listen(PORT, () => console.log(`Défilé Studio MCP prêt sur http://localhost:${PORT}/mcp`));
