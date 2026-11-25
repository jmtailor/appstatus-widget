const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, dialog, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { collect } = require('./collector');

if (!app.requestSingleInstanceLock()) app.quit();

const DEFAULTS = {
  corner: 'top-right', opacity: 0.92, alwaysOnTop: true, clickThrough: false,
  driveRoot: '', githubToken: '', autostart: false, intervalMin: 10, width: 700, height: 440, collapsed: false, startCollapsed: true,
};
const userDir = () => app.getPath('userData');
const fp = (n) => path.join(userDir(), n);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));

let settings, apps, state = { apps: [], changes: [], collectedAt: 0, busy: false };
let win, tray, timer, watchers = [], debounce;

function guessDriveRoot() {
  const home = app.getPath('home');
  const bases = ['G:/내 드라이브', 'G:/My Drive', 'H:/내 드라이브', path.join(home, 'Google Drive'), path.join(home, '내 드라이브'), path.join(home, 'My Drive')];
  for (const b of bases) {
    try {
      const hit = fs.readdirSync(b).find((n) => n.toLowerCase().replace(/\s/g, '') === 'createapp');
      if (hit) return path.join(b, hit);
    } catch {}
  }
  return '';
}

function place() {
  if (!win) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const w = settings.width, h = settings.collapsed ? 46 : settings.height, m = 12;
  const right = settings.corner.endsWith('right'), bottom = settings.corner.startsWith('bottom');
  win.setBounds({ x: right ? wa.x + wa.width - w - m : wa.x + m, y: bottom ? wa.y + wa.height - h - m : wa.y + m, width: w, height: h });
}

function applySettings() {
  if (!win) return;
  win.setOpacity(Math.min(1, Math.max(0.2, settings.opacity)));
  win.setAlwaysOnTop(!!settings.alwaysOnTop, 'floating');
  win.setIgnoreMouseEvents(!!settings.clickThrough, { forward: true });
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!settings.autostart });
  else app.setLoginItemSettings({ openAtLogin: !!settings.autostart, path: process.execPath, args: [app.getAppPath()] });
  place();
  buildTrayMenu();
}

function push() { if (win && !win.isDestroyed()) win.webContents.send('state', { settings, ...state }); }

async function refresh() {
  if (state.busy) return;
  state.busy = true; push();
  try {
    const snap = readJson(fp('snapshot.json'), null);
    const store = readJson(fp('repocache.json'), { repos: {} });
    const r = await collect(apps, settings, snap, store);
    writeJson(fp('repocache.json'), store);
    state.apps = r.apps; state.collectedAt = r.collectedAt;
    const log = r.baseline ? [] : readJson(fp('changes.json'), []);
    state.changes = [...r.newChanges, ...log].slice(0, 12);
    writeJson(fp('changes.json'), state.changes);
    writeJson(fp('snapshot.json'), r.snapshot);
  } catch (e) { state.error = String(e.message || e); }
  state.busy = false; push();
}

function startWatch() {
  watchers.forEach((w) => { try { w.close(); } catch {} });
  watchers = [];
  const dirs = new Set();
  if (settings.driveRoot) dirs.add(settings.driveRoot);
  apps.forEach((a) => { if (a.folder && path.isAbsolute(a.folder)) dirs.add(a.folder); });
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    try { watchers.push(fs.watch(d, { recursive: true }, () => { clearTimeout(debounce); debounce = setTimeout(refresh, 4000); })); } catch {}
  }
}

function schedule() {
  clearInterval(timer);
  timer = setInterval(refresh, Math.max(2, settings.intervalMin) * 60000);
}

function toggleCollapse() { settings.collapsed = !settings.collapsed; writeJson(fp('settings.json'), settings); place(); push(); buildTrayMenu(); }
function setCorner(c) { settings.corner = c; writeJson(fp('settings.json'), settings); applySettings(); push(); }
function buildTrayMenu() {
  if (!tray) return;
  const corners = [['top-right', '우측 상단'], ['bottom-right', '우측 하단'], ['top-left', '좌측 상단'], ['bottom-left', '좌측 하단']];
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '위젯 보이기/숨기기', click: () => (win.isVisible() ? win.hide() : win.show()) },
    { label: settings.collapsed ? '펼치기' : '접기(최소화)', click: toggleCollapse },
    { label: '지금 새로고침', click: refresh },
    { type: 'separator' },
    ...corners.map(([v, l]) => ({ label: l, type: 'radio', checked: settings.corner === v, click: () => setCorner(v) })),
    { type: 'separator' },
    { label: '마우스 통과(클릭 무시)', type: 'checkbox', checked: settings.clickThrough, click: (i) => { settings.clickThrough = i.checked; writeJson(fp('settings.json'), settings); applySettings(); push(); } },
    { label: '앱 목록 파일(apps.json) 열기', click: () => shell.openPath(fp('apps.json')) },
    { type: 'separator' },
    { label: '종료', click: () => app.exit(0) },
  ]));
}

function createWindow() {
  win = new BrowserWindow({
    width: settings.width, height: settings.height, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, show: false, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => { applySettings(); win.show(); push(); });
}

app.whenReady().then(() => {
  settings = { ...DEFAULTS, ...readJson(fp('settings.json'), {}) };
  if (!settings.driveRoot) settings.driveRoot = guessDriveRoot();
  if (!fs.existsSync(fp('apps.json'))) fs.copyFileSync(path.join(__dirname, 'apps.default.json'), fp('apps.json'));
  apps = readJson(fp('apps.json'), []);
  const defs = readJson(path.join(__dirname, 'apps.default.json'), []);
  for (const d of defs) {
    const u = apps.find((x) => x.id === d.id);
    if (!u) apps.push(d);
    else { if (!u.folder && d.folder) u.folder = d.folder; if (!u.repo && d.repo) u.repo = d.repo; }
  }
  writeJson(fp('apps.json'), apps);
  if (!settings.autostartInit) { settings.autostart = true; settings.autostartInit = true; }
  if (settings.startCollapsed) settings.collapsed = true;
  writeJson(fp('settings.json'), settings);

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')));
  tray.setToolTip('앱 개발 현황');
  tray.on('click', () => (win.isVisible() ? win.hide() : win.show()));
  createWindow(); buildTrayMenu(); startWatch(); schedule(); refresh();
  screen.on('display-metrics-changed', place);
});

ipcMain.handle('get-state', () => ({ settings, ...state }));
ipcMain.handle('set-settings', (_e, patch) => {
  const prevRoot = settings.driveRoot, prevInt = settings.intervalMin, prevTok = settings.githubToken;
  settings = { ...settings, ...patch };
  writeJson(fp('settings.json'), settings);
  applySettings();
  if (settings.driveRoot !== prevRoot) startWatch();
  if (settings.intervalMin !== prevInt) schedule();
  if (settings.driveRoot !== prevRoot || settings.githubToken !== prevTok) refresh();
  push();
});
ipcMain.handle('refresh', refresh);
ipcMain.handle('reload-apps', () => { apps = readJson(fp('apps.json'), apps); startWatch(); return refresh(); });
ipcMain.handle('open-apps-file', () => shell.openPath(fp('apps.json')));
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Create APP 폴더 선택' });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('hide', () => win.hide());
ipcMain.handle('toggle-collapse', toggleCollapse);
