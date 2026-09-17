// Electron: şeffaf, çerçevesiz, her zaman üstte duran maskot penceresi.
// Sunucu bu süreç içinde çalışır; ayrıca `node server.js` açmana gerek yok.

const { app, BrowserWindow, screen, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { start, PORT } = require('./server');

const W = 460;
const H = 320;
const MARGIN = 8;
const CAN_FORWARD = process.platform === 'win32' || process.platform === 'darwin';

let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const posFile = () => path.join(app.getPath('userData'), 'konum.json');

function bottomLeft() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + MARGIN, y: wa.y + wa.height - H };
}

function savedPos() {
  try {
    const p = JSON.parse(fs.readFileSync(posFile(), 'utf8'));
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      p.x + W > a.x && p.x < a.x + a.width && p.y + H > a.y && p.y < a.y + a.height);
    if (onScreen) return p;
  } catch {}
  return null;
}

function resetPos() {
  const p = bottomLeft();
  win.setPosition(p.x, p.y);
  fs.rm(posFile(), { force: true }, () => {});
}

app.whenReady().then(async () => {
  try {
    await start();
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} kullanımda. Başka bir maskot ya da 'node server.js' açık olabilir.`);
    } else {
      console.error(err);
    }
    app.quit();
    return;
  }

  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  const { x, y } = savedPos() || bottomLeft();
  win = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Boş alanlara tıklamalar alttaki uygulamaya geçsin; maskotun üstüne gelince yakalanır.
  if (CAN_FORWARD) win.setIgnoreMouseEvents(true, { forward: true });

  win.loadURL(`http://127.0.0.1:${PORT}/`);
  win.once('ready-to-show', () => win.showInactive());
});

ipcMain.on('clickable', (_e, on) => {
  if (win && CAN_FORWARD) win.setIgnoreMouseEvents(!on, { forward: true });
});

ipcMain.handle('pos', () => (win ? win.getPosition() : [0, 0]));

ipcMain.on('move', (_e, nx, ny) => {
  if (win) win.setPosition(Math.round(nx), Math.round(ny));
});

ipcMain.on('moved', () => {
  if (!win) return;
  const [px, py] = win.getPosition();
  fs.writeFile(posFile(), JSON.stringify({ x: px, y: py }), () => {});
});

ipcMain.on('menu', () => {
  if (!win) return;
  Menu.buildFromTemplate([
    { label: 'Test gösterisini oynat', click: () => win.webContents.send('tour') },
    { label: 'Sol alt köşeye geri koy', click: resetPos },
    { type: 'separator' },
    { label: 'Maskotu kapat', click: () => app.quit() },
  ]).popup({ window: win });
});

app.on('window-all-closed', () => app.quit());
