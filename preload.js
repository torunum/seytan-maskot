// Pencere ile maskot sayfası arasındaki küçük köprü.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maskot', {
  setClickable: (on) => ipcRenderer.send('clickable', !!on),
  getPos: () => ipcRenderer.invoke('pos'),
  move: (x, y) => ipcRenderer.send('move', x, y),
  moved: () => ipcRenderer.send('moved'),
  menu: () => ipcRenderer.send('menu'),
  onTour: (fn) => ipcRenderer.on('tour', () => fn()),
});
