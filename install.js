#!/usr/bin/env node
// Maskot hook'larını Claude Code kullanıcı ayarlarına ekler (tüm projeler için).
//   node install.js           -> ekle (tekrar çalıştırmak güvenli, çift eklemez)
//   node install.js --kaldir  -> sadece maskot hook'larını sil
// Değişiklikten önce settings.json'un yedeği alınır. Mevcut diğer hook'lara dokunulmaz.

const fs = require('fs');
const path = require('path');
const os = require('os');

const MARK = '--seytan-maskot';
const EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'Notification', 'SubagentStart', 'SubagentStop', 'Stop',
  'StopFailure', 'PreCompact', 'SessionEnd',
];

const remove = process.argv.includes('--kaldir');
const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const settingsPath = path.join(claudeDir, 'settings.json');
const hookScript = path.join(__dirname, 'hook.js');

let settings = {};
if (fs.existsSync(settingsPath)) {
  const text = fs.readFileSync(settingsPath, 'utf8');
  try {
    settings = text.trim() ? JSON.parse(text) : {};
  } catch (e) {
    console.error(`${settingsPath} geçerli JSON değil, dokunmadım. Dosyayı düzeltip tekrar çalıştır.`);
    console.error(e.message);
    process.exit(1);
  }
  const backup = `${settingsPath}.maskot-yedek-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(settingsPath, backup);
  console.log(`Yedek alındı: ${backup}`);
} else {
  fs.mkdirSync(claudeDir, { recursive: true });
}

const isOurs = (h) => Array.isArray(h && h.args) && h.args.includes(MARK);

settings.hooks = settings.hooks || {};

// Önce eski maskot kayıtlarını temizle
for (const ev of Object.keys(settings.hooks)) {
  const groups = settings.hooks[ev];
  if (!Array.isArray(groups)) continue;
  settings.hooks[ev] = groups
    .map((g) => {
      if (!g || !Array.isArray(g.hooks)) return g;
      const had = g.hooks.some(isOurs);
      const rest = g.hooks.filter((h) => !isOurs(h));
      return had && rest.length === 0 ? null : { ...g, hooks: rest };
    })
    .filter(Boolean);
  if (settings.hooks[ev].length === 0) delete settings.hooks[ev];
}

if (!remove) {
  for (const ev of EVENTS) {
    settings.hooks[ev] = settings.hooks[ev] || [];
    settings.hooks[ev].push({
      hooks: [
        {
          type: 'command',
          command: process.execPath,
          args: [hookScript, MARK],
          async: true,
        },
      ],
    });
  }
}

if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

if (remove) {
  console.log('Maskot hook\'ları kaldırıldı.');
} else {
  console.log(`Maskot hook'ları eklendi: ${settingsPath}`);
  console.log(`Node: ${process.execPath}`);
  console.log(`Köprü: ${hookScript}`);
  console.log('Claude Code içinde /hooks yazarak kontrol edebilirsin. Açık oturumlar ayarı genelde kendiliğinden algılar.');
}
