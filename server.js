// Şeytan maskot sunucusu
// Claude Code hook'larından gelen olayları alır, maskotun anlayacağı
// sade durumlara çevirir ve bağlı maskot pencerelerine (SSE) yayınlar.
// Bağımlılık yok. Tek başına: `node server.js`  |  Electron içinden: require('./server').start()

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createNoticer } = require('./notice');

const PORT = Number(process.env.MASKOT_PORT) || 47620;
const ROOT = __dirname;
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

const clients = new Set();
const noticer = createNoticer();
let pendingNotice = null;   // {notice, sid} — yayınlanacak olay bulunamazsa bekler
let lastEvent = null;
let eventId = 0;

// session_id -> { working, tool, seen }
const sessions = new Map();
// Bitmiş tool_use_id'ler (async hook'lar sırasız gelebilir diye)
const finishedTools = new Set();

function rememberFinished(id) {
  finishedTools.add(id);
  if (finishedTools.size > 300) finishedTools.delete(finishedTools.values().next().value);
}

function oneLine(s, max = 90) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function base(p) {
  return p ? path.basename(String(p)) : '';
}

function toolInfo(name, input) {
  input = input || {};
  if (/^(Bash|PowerShell|BashOutput|KillShell|KillBash)$/.test(name))
    return { cat: 'bash', detail: oneLine(input.command || name) };
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(name))
    return { cat: 'edit', detail: base(input.file_path || input.notebook_path) };
  if (/^(Read|NotebookRead)$/.test(name))
    return { cat: 'read', detail: base(input.file_path || input.notebook_path) };
  if (/^(Grep|Glob|LS|ToolSearch)$/.test(name))
    return { cat: 'search', detail: oneLine(input.pattern || base(input.path), 60) };
  if (name === 'WebFetch') {
    let host = '';
    try { host = new URL(input.url).hostname; } catch {}
    return { cat: 'web', detail: host };
  }
  if (name === 'WebSearch') return { cat: 'web', detail: oneLine(input.query, 60) };
  if (/^(Task|Agent)$/.test(name))
    return { cat: 'agent', detail: oneLine(input.description || input.subagent_type, 60) };
  if (/^(TodoWrite|TaskCreate|TaskUpdate|TaskList)$/.test(name)) return { cat: 'todo', detail: '' };
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    return { cat: 'mcp', detail: parts[2] ? `${parts[1]} / ${parts[2]}` : parts[1] };
  }
  return { cat: 'tool', detail: name };
}

function busyCount() {
  const now = Date.now();
  let n = 0;
  for (const [id, s] of sessions) {
    if (now - s.seen > 30 * 60 * 1000) { sessions.delete(id); continue; }
    if (s.working) n++;
  }
  return n;
}

// Ham hook verisini maskot olayına çevirir. null = gösterme.
function mapEvent(p) {
  const ev = p.hook_event_name;
  const sid = p.session_id || 'bilinmeyen';
  let s = sessions.get(sid);
  if (!s) { s = { working: false, tool: null, seen: Date.now() }; sessions.set(sid, s); }
  s.seen = Date.now();

  switch (ev) {
    case 'SessionStart':
      return { state: 'hello' };

    case 'UserPromptSubmit':
      s.working = true;
      return { state: 'thinking' };

    case 'PreToolUse': {
      s.working = true;
      const t = toolInfo(p.tool_name || '', p.tool_input);
      const alreadyDone = p.tool_use_id && finishedTools.has(p.tool_use_id);
      s.tool = alreadyDone ? null : p.tool_use_id || null;
      return { state: t.cat, detail: t.detail, brief: !!alreadyDone };
    }

    case 'PostToolUse':
    case 'PostToolUseFailure': {
      if (p.tool_use_id) rememberFinished(p.tool_use_id);
      if (!s.working) return null; // Stop'tan sonra geç kalmış olay
      if (s.tool && p.tool_use_id && s.tool !== p.tool_use_id) return null; // paralel araç, ekrandaki başka
      s.tool = null;
      const t = toolInfo(p.tool_name || '', p.tool_input);
      if (ev === 'PostToolUseFailure') return { state: 'error', detail: t.detail, urgent: true };
      return { state: 'toolDone', cat: t.cat, detail: t.detail };
    }

    case 'PermissionRequest':
      return { state: 'permission', detail: p.tool_name || '', urgent: true };

    case 'Notification': {
      const type = p.notification_type || '';
      const msg = String(p.message || '').toLowerCase();
      if (type === 'permission_prompt' || (!type && msg.includes('permission')))
        return { state: 'permission', detail: p.tool_name || '', urgent: true };
      if (type === 'agent_needs_input')
        return { state: 'permission', detail: '', urgent: true };
      if (type === 'idle_prompt' || (!type && msg.includes('waiting')))
        return { state: 'waiting' };
      return null;
    }

    case 'SubagentStart':
      return { state: 'agent', detail: oneLine(p.agent_type, 60) };

    case 'SubagentStop':
      return { state: 'subDone', detail: oneLine(p.agent_type, 60) };

    case 'Stop': {
      s.working = false;
      s.tool = null;
      return busyCount() > 0 ? { state: 'partDone', urgent: true } : { state: 'done', urgent: true };
    }

    case 'StopFailure':
      s.working = false;
      s.tool = null;
      return { state: 'error', detail: oneLine(p.error_type || p.error || '', 60), urgent: true, fatal: true };

    case 'PreCompact':
      return { state: 'compact' };

    case 'SessionEnd':
      sessions.delete(sid);
      return { state: 'bye', urgent: true };

    default:
      return null;
  }
}

function broadcast(evt) {
  const data = `id: ${evt.id}\ndata: ${JSON.stringify(evt)}\n\n`;
  for (const res of clients) res.write(data);
}

function handleHook(payload) {
  // Not her olayda beslenir: mapEvent null dönse bile sayaçlar ilerlemeli.
  const sid = payload.session_id || 'bilinmeyen';
  const info = toolInfo(payload.tool_name || '', payload.tool_input);
  const notice = noticer.observe(payload, info);
  if (notice) pendingNotice = { notice, sid };

  if (payload.hook_event_name === 'SessionEnd') {
    noticer.forget(sid);
    if (pendingNotice && pendingNotice.sid === sid) pendingNotice = null;
  }

  const out = mapEvent(payload);
  if (!out) return;

  const evt = {
    ...out,
    id: ++eventId,
    t: Date.now(),
    project: payload.cwd ? path.basename(payload.cwd) : '',
    busy: busyCount(),
  };
  // Ateşlenen not, yayınlanacak ilk olaya iliştirilir — ama yalnızca AYNI
  // oturumun olayına. Paralel oturumlarda aksi halde A'nın notu B'nin
  // olayına biner ve maskot yanlış projenin adıyla yanlış komutu söyler.
  if (pendingNotice && pendingNotice.sid === sid) {
    evt.notice = pendingNotice.notice;
    pendingNotice = null;
  }

  lastEvent = evt;
  broadcast(evt);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2' };

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Bulunamadı'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    // DNS rebinding'e karşı: sadece yerel host adları
    if (!ALLOWED_HOSTS.has(req.headers.host)) { res.writeHead(403); return res.end(); }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'POST' && url.pathname === '/event') {
      // application/json şartı, başka sitelerin sahte olay göndermesini engeller
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        res.writeHead(415); return res.end();
      }
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (c) => {
        body += c;
        if (body.length > 256 * 1024) { res.writeHead(413); res.end(); req.destroy(); }
      });
      req.on('end', () => {
        try { handleHook(JSON.parse(body)); } catch {}
        if (!res.writableEnded) { res.writeHead(204); res.end(); }
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 2000\n\n');
      if (lastEvent) res.write(`id: ${lastEvent.id}\ndata: ${JSON.stringify({ ...lastEvent, replay: true })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return serveFile(res, path.join(ROOT, 'mascot.html'));
    }

    if (req.method === 'GET' && url.pathname.startsWith('/fonts/')) {
      return serveFile(res, path.join(ROOT, 'fonts', path.basename(url.pathname)));
    }

    res.writeHead(404);
    res.end('Bulunamadı');
  });
}

function start() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    const heartbeat = setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 20000);
    heartbeat.unref();
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { start, PORT, mapEvent };

if (require.main === module) {
  start()
    .then(() => {
      console.log(`Şeytan maskot sunucusu çalışıyor: http://127.0.0.1:${PORT}`);
      console.log(`Test için tarayıcıda aç: http://127.0.0.1:${PORT}/?demo`);
    })
    .catch((err) => {
      if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} kullanımda. Maskot zaten açık olabilir, ya da MASKOT_PORT ile başka port seç.`);
      else console.error(err);
      process.exit(1);
    });
}
