// Takılma sezme.
// Olay akışını izler, kullanıcının bir yerde takıldığını gösteren desenleri
// yakalar. Zaman kullanmaz; pencere de fren de olay sayısıyla ölçülür.
//
// Araç adı tanımayı bu modül yapmaz: server.js zaten toolInfo() ile kategori
// çıkarıyor, o sonuç `info` olarak geçirilir. Böylece regexler tek yerde kalır.

const WINDOW = 12;        // son kaç komut/dosya hatırlansın
const COOLDOWN = 6;       // farklı türde yeni not için geçmesi gereken olay

const REPEAT_STEPS = [3, 5, 7];
const FAIL_STEPS = [2, 4, 6];
const REVISIT_STEPS = [2, 3, 4];

const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const base = (p) => (p ? String(p).split(/[\/]/).pop() : '');

// files listesinde `file` kaç kez "dönüş" yapmış: daha önce görülmüş ve
// arada en az bir BAŞKA dosya düzenlenmişse bir dönüş sayılır.
// Üst üste aynı dosyayı düzenlemek dönüş değildir.
function returnCount(files, file) {
  let n = 0, seen = false, away = false;
  for (const f of files) {
    if (f === file) {
      if (seen && away) { n += 1; away = false; }
      seen = true;
    } else if (seen) {
      away = true;
    }
  }
  return n;
}

// Eşiklerde seviye döndürür; eşiklerin üstünde her 4'te bir seviye 3.
// Not: repeat ve revisit sayıları WINDOW ile sınırlıdır (liste o kadar kayıt
// tutar), yani repeat için ulaşılabilen son eşik 11'dir. Uzun bir takılma
// döngüsünde maskot 3/5/7/11'de konuşur, sonra susar. Bilinçli: sonsuza kadar
// tekrarlayan bir yorum, yorum olmaktan çıkıp gürültü olur.
function levelFor(steps, count) {
  const i = steps.indexOf(count);
  if (i !== -1) return i + 1;
  const last = steps[steps.length - 1];
  if (count > last && (count - last) % 4 === 0) return 3;
  return 0;
}

function push(list, value) {
  list.push(value);
  if (list.length > WINDOW) list.shift();
}

function createNoticer() {
  const sessions = new Map();

  function ledger(id) {
    let s = sessions.get(id);
    if (!s) {
      // since Infinity: ilk not frene takılmasın
      s = { cmds: [], files: [], fails: 0, lastKind: null, since: Infinity };
      sessions.set(id, s);
    }
    return s;
  }

  function observe(payload, info) {
    const ev = payload.hook_event_name;
    const s = ledger(payload.session_id || 'bilinmeyen');
    if (TOOL_EVENTS.has(ev)) s.since += 1;

    // Kurallar ayrık olaylarda ateşler, bu yüzden en fazla biri uyabilir.
    // Aşağıdaki if/else if zinciri bunu yapısal olarak garanti eder; ayrıca
    // bir öncelik tablosu tutmaya gerek yok.
    let hit = null;

    if (ev === 'PostToolUseFailure') {
      s.fails += 1;
      const level = levelFor(FAIL_STEPS, s.fails);
      if (level) hit = { kind: 'failStreak', count: s.fails, level, detail: (info && info.detail) || '' };
    } else if (ev === 'PostToolUse') {
      s.fails = 0;
    } else if (ev === 'PreToolUse' && info && info.cat === 'bash') {
      const cmd = norm(payload.tool_input && payload.tool_input.command);
      if (cmd) {
        push(s.cmds, cmd);
        const count = s.cmds.filter((c) => c === cmd).length;
        const level = levelFor(REPEAT_STEPS, count);
        if (level) hit = { kind: 'repeat', count, level, detail: cmd };
      }
    } else if (ev === 'PreToolUse' && info && info.cat === 'edit') {
      const ti = payload.tool_input || {};
      const file = base(ti.file_path || ti.notebook_path);
      if (file) {
        push(s.files, file);
        const count = returnCount(s.files, file);
        const level = levelFor(REVISIT_STEPS, count);
        if (level) hit = { kind: 'revisit', count, level, detail: file };
      }
    }

    if (!hit) return null;

    // Fren: farklı türde yeni not için COOLDOWN kadar olay geçmeli.
    // Aynı türün kademe atlaması muaf — yoksa 3. -> 5. tırmanışı hiç olmaz.
    if (hit.kind !== s.lastKind && s.since < COOLDOWN) return null;

    s.lastKind = hit.kind;
    s.since = 0;
    return hit;
  }

  function forget(sessionId) {
    sessions.delete(sessionId);
  }

  return { observe, forget };
}

module.exports = { createNoticer, WINDOW, COOLDOWN, REPEAT_STEPS, FAIL_STEPS, REVISIT_STEPS };
