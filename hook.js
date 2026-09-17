#!/usr/bin/env node
// Claude Code hook köprüsü.
// stdin'den hook JSON'unu okur, sadece maskotun ihtiyaç duyduğu alanları seçer
// ve yerel maskot sunucusuna POST eder.
// Kurallar: stdout'a ASLA yazmaz (bazı olaylarda stdout Claude'un bağlamına eklenir)
// ve her durumda 0 ile çıkar (maskot kapalıysa Claude Code etkilenmez).

const http = require('http');

const PORT = Number(process.env.MASKOT_PORT) || 47620;

setTimeout(() => process.exit(0), 2500); // ne olursa olsun takılı kalma

const cut = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);

function pick(p) {
  const ti = p.tool_input || {};
  return {
    hook_event_name: p.hook_event_name,
    session_id: p.session_id,
    agent_id: p.agent_id,
    agent_type: cut(p.agent_type, 80),
    cwd: p.cwd,
    tool_name: p.tool_name,
    tool_use_id: p.tool_use_id,
    tool_input: {
      command: cut(ti.command, 300),
      file_path: cut(ti.file_path, 300),
      notebook_path: cut(ti.notebook_path, 300),
      pattern: cut(ti.pattern, 120),
      path: cut(ti.path, 300),
      url: cut(ti.url, 300),
      query: cut(ti.query, 120),
      description: cut(ti.description, 120),
      subagent_type: cut(ti.subagent_type, 80),
    },
    notification_type: p.notification_type,
    message: cut(p.message, 200),
    error_type: cut(p.error_type, 80),
    error: cut(typeof p.error === 'string' ? p.error : '', 120),
  };
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  raw += c;
  if (raw.length > 20 * 1024 * 1024) process.exit(0);
});
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const body = JSON.stringify(pick(payload));
  const req = http.request(
    {
      host: '127.0.0.1',
      port: PORT,
      path: '/event',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 800,
    },
    (res) => { res.resume(); res.on('end', () => process.exit(0)); }
  );
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(body);
});
process.stdin.on('error', () => process.exit(0));
