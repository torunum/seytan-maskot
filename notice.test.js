const test = require('node:test');
const assert = require('node:assert');
const { createNoticer } = require('./notice');

// Yardımcılar: observe(payload, info) ikilisini üretirler.
function bash(command, session = 's1') {
  return [
    { hook_event_name: 'PreToolUse', session_id: session, tool_input: { command } },
    { cat: 'bash', detail: command },
  ];
}
function post(session = 's1') {
  return [{ hook_event_name: 'PostToolUse', session_id: session }, { cat: 'bash', detail: '' }];
}

test('aynı komut 3. kez çalışınca seviye 1 not düşer', () => {
  const n = createNoticer();
  assert.equal(n.observe(...bash('npm test')), null);
  assert.equal(n.observe(...post()), null);
  assert.equal(n.observe(...bash('npm test')), null);
  assert.equal(n.observe(...post()), null);
  const hit = n.observe(...bash('npm test'));
  assert.deepEqual(hit, { kind: 'repeat', count: 3, level: 1, detail: 'npm test' });
});

test('4. tekrarda susar, 5.te seviye 2 ile konuşur', () => {
  const n = createNoticer();
  for (let i = 0; i < 2; i++) { n.observe(...bash('npm test')); n.observe(...post()); }
  n.observe(...bash('npm test'));                       // 3. -> konuştu
  n.observe(...post());
  assert.equal(n.observe(...bash('npm test')), null);   // 4. -> sessiz
  n.observe(...post());
  const hit = n.observe(...bash('npm test'));           // 5. -> seviye 2
  assert.equal(hit.level, 2);
  assert.equal(hit.count, 5);
});

test('aynı türün kademe atlaması frene takılmaz', () => {
  // 3. ile 5. tekrar arasında yalnızca 3 olay var; fren 6 olay istiyor.
  // Aynı tür muaf olmasaydı 5. tekrar susardı ve tırmanış hiç olmazdı.
  const n = createNoticer();
  for (let i = 0; i < 2; i++) { n.observe(...bash('x')); n.observe(...post()); }
  assert.equal(n.observe(...bash('x')).level, 1);
  n.observe(...post());
  n.observe(...bash('x'));
  n.observe(...post());
  assert.equal(n.observe(...bash('x')).level, 2);
});

test('komut boşlukları sadeleşir', () => {
  const n = createNoticer();
  n.observe(...bash('npm   test')); n.observe(...post());
  n.observe(...bash(' npm test ')); n.observe(...post());
  const hit = n.observe(...bash('npm\ttest'));
  assert.equal(hit.count, 3);
});

test('pencere kayar: araya 12 başka komut girince eski tekrar sayılmaz', () => {
  const n = createNoticer();
  n.observe(...bash('hedef'));
  for (let i = 0; i < 12; i++) n.observe(...bash('dolgu' + i));
  n.observe(...bash('hedef'));
  const hit = n.observe(...bash('hedef'));
  assert.equal(hit, null, 'ilk hedef pencereden düşmeli, sayı 3e ulaşmamalı');
});

test('farklı oturumların sayaçları karışmaz', () => {
  const n = createNoticer();
  for (let i = 0; i < 2; i++) { n.observe(...bash('y', 'A')); n.observe(...post('A')); }
  n.observe(...bash('y', 'B'));
  assert.equal(n.observe(...bash('y', 'A')).count, 3);
});

test('forget oturumu sıfırlar', () => {
  const n = createNoticer();
  for (let i = 0; i < 2; i++) { n.observe(...bash('z')); n.observe(...post()); }
  n.forget('s1');
  assert.equal(n.observe(...bash('z')), null);
});

test('7den sonra her 4te bir seviye 3, pencere tavanına kadar', () => {
  // Sayı pencereyle sınırlı: cmds en fazla WINDOW(12) kayıt tutar, yani
  // count 12'de tavan yapar. Ulaşılabilen son eşik 11'dir; 15 hiç gelmez.
  const n = createNoticer();
  const levels = [];
  for (let i = 1; i <= 16; i++) {
    const hit = n.observe(...bash('q'));
    if (hit) levels.push([i, hit.level]);
    n.observe(...post());
  }
  assert.deepEqual(levels, [[3, 1], [5, 2], [7, 3], [11, 3]]);
});

test('Stop sayaçları sıfırlamaz', () => {
  // Takılma turlar arası bir şey; Stop geldi diye unutulmamalı.
  const n = createNoticer();
  for (let i = 0; i < 2; i++) { n.observe(...bash('r')); n.observe(...post()); }
  n.observe({ hook_event_name: 'Stop', session_id: 's1' }, { cat: 'tool', detail: '' });
  assert.equal(n.observe(...bash('r')).count, 3);
});

function fail(detail = 'npm test', session = 's1') {
  return [{ hook_event_name: 'PostToolUseFailure', session_id: session }, { cat: 'bash', detail }];
}

test('üst üste 2 hata seviye 1 not düşer', () => {
  const n = createNoticer();
  assert.equal(n.observe(...fail()), null);
  const hit = n.observe(...fail());
  assert.deepEqual(hit, { kind: 'failStreak', count: 2, level: 1, detail: 'npm test' });
});

test('başarılı araç seriyi sıfırlar', () => {
  const n = createNoticer();
  n.observe(...fail());
  n.observe(...post());
  assert.equal(n.observe(...fail()), null, 'seri sıfırlandığı için 1. hata sessiz');
});

test('hata serisi 4 ve 6da tırmanır', () => {
  const n = createNoticer();
  const levels = [];
  for (let i = 1; i <= 6; i++) {
    const hit = n.observe(...fail());
    if (hit) levels.push([i, hit.level]);
  }
  assert.deepEqual(levels, [[2, 1], [4, 2], [6, 3]]);
});

test('farklı tür not frene takılır', () => {
  const n = createNoticer();
  for (let i = 0; i < 2; i++) { n.observe(...bash('w')); n.observe(...post()); }
  assert.equal(n.observe(...bash('w')).kind, 'repeat');  // fren sıfırlandı
  n.observe(...fail());
  assert.equal(n.observe(...fail()), null, 'farklı tür, 6 olay geçmedi');
});

function edit(file, session = 's1') {
  return [
    { hook_event_name: 'PreToolUse', session_id: session, tool_input: { file_path: 'C:/proje/src/' + file } },
    { cat: 'edit', detail: file },
  ];
}

test('araya başka dosya girmeden dönüş sayılmaz', () => {
  const n = createNoticer();
  n.observe(...edit('a.js'));
  n.observe(...edit('a.js'));
  assert.equal(n.observe(...edit('a.js')), null);
});

test('2. dönüşte seviye 1 not düşer, detay dosya adı', () => {
  const n = createNoticer();
  n.observe(...edit('a.js'));
  n.observe(...edit('b.js'));
  n.observe(...edit('a.js'));               // 1. dönüş
  n.observe(...edit('b.js'));
  const hit = n.observe(...edit('a.js'));   // 2. dönüş
  assert.deepEqual(hit, { kind: 'revisit', count: 2, level: 1, detail: 'a.js' });
});

test('dosya adı yoldan ayıklanır', () => {
  const n = createNoticer();
  n.observe(...edit('uzun.js'));
  n.observe(...edit('baska.js'));
  n.observe(...edit('uzun.js'));
  n.observe(...edit('baska.js'));
  assert.equal(n.observe(...edit('uzun.js')).detail, 'uzun.js');
});
