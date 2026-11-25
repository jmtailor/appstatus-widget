const C = { green: '#3fb950', yellow: '#e3b341', red: '#f85149', purple: '#a371f7' };
const L = { green: '빌드됨', yellow: '베타', red: '코드 없음', purple: '계획' };
let S = { settings: {}, apps: [], changes: [], collectedAt: 0, busy: false };
let filter = null;
const $ = (id) => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
const fmt = (iso) => (iso ? iso.slice(0, 10).slice(5).replace('-', '/') : '-');

function render() {
  const apps = S.apps;
  const cnt = { green: 0, yellow: 0, red: 0, purple: 0 };
  apps.forEach((a) => cnt[a.status]++);
  $('live').className = 'live' + (S.busy ? ' busy' : '');
  $('at').textContent = S.collectedAt ? new Date(S.collectedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 수집' : '수집 중…';

  const tiles = $('tiles'); tiles.textContent = '';
  const order = ['green', 'yellow', 'red', 'purple'];
  [...apps].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)).forEach((a) => {
    const t = el('div', 'tile' + (filter && filter !== a.status ? ' dim' : ''));
    t.style.setProperty('--c', C[a.status]);
    t.title = a.note + (a.evidence.error ? '\n⚠ ' + a.evidence.error : '');
    t.appendChild(el('b', '', a.name));
    t.appendChild(el('div', 'nx', a.next));
    t.appendChild(el('div', 'dt', fmt(a.lastActivity) + (a.evidence.release ? ' · ' + a.evidence.release : '')));
    if (a.suggest && a.suggest !== a.status) t.appendChild(el('div', 'hint', '제안: ' + L[a.suggest]));
    tiles.appendChild(t);
  });

  const ns = 'http://www.w3.org/2000/svg', s = $('donut'); s.textContent = '';
  const r = 70, cc = 2 * Math.PI * r; let off = 0;
  order.forEach((k) => {
    if (!cnt[k]) return;
    const len = cc * cnt[k] / apps.length, c = document.createElementNS(ns, 'circle');
    for (const [n, v] of Object.entries({ cx: 90, cy: 90, r, fill: 'none', stroke: C[k], 'stroke-width': 26, 'stroke-dasharray': `${len - 2} ${cc - len + 2}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 90 90)' })) c.setAttribute(n, v);
    c.style.cursor = 'pointer'; c.onclick = () => { filter = filter === k ? null : k; render(); };
    s.appendChild(c); off += len;
  });
  const tx = document.createElementNS(ns, 'text');
  for (const [n, v] of Object.entries({ x: 90, y: 98, 'text-anchor': 'middle', fill: '#e6edf3', 'font-size': 28, 'font-weight': 700 })) tx.setAttribute(n, v);
  tx.textContent = apps.length; s.appendChild(tx);

  const lg = $('legend'); lg.textContent = '';
  order.forEach((k) => {
    const d = el('div'); const i = el('i'); i.style.background = C[k];
    d.appendChild(i); d.appendChild(el('span', '', `${L[k]} ${cnt[k]}`));
    if (filter === k) d.style.fontWeight = '700';
    d.onclick = () => { filter = filter === k ? null : k; render(); };
    lg.appendChild(d);
  });

  const ul = $('chg'); ul.textContent = '';
  if (!S.changes.length) ul.appendChild(el('li', '', '아직 변화 없음'));
  S.changes.forEach((c) => ul.appendChild(el('li', '', `${new Date(c.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} ${c.text}`)));

  const st = S.settings;
  if (document.activeElement !== $('op')) { $('op').value = Math.round(st.opacity * 100); $('opv').textContent = Math.round(st.opacity * 100) + '%'; }
  $('corner').value = st.corner; $('top').checked = !!st.alwaysOnTop; $('auto').checked = !!st.autostart;
  if (document.activeElement !== $('root')) $('root').value = st.driveRoot || '';
  if (document.activeElement !== $('iv')) $('iv').value = st.intervalMin;
}

$('bRef').onclick = () => api.refresh();
$('bHide').onclick = () => api.hide();
$('bSet').onclick = () => { $('panel').hidden = !$('panel').hidden; };
$('close').onclick = () => { $('panel').hidden = true; };
$('op').oninput = (e) => { $('opv').textContent = e.target.value + '%'; api.setSettings({ opacity: e.target.value / 100 }); };
$('corner').onchange = (e) => api.setSettings({ corner: e.target.value });
$('top').onchange = (e) => api.setSettings({ alwaysOnTop: e.target.checked });
$('auto').onchange = (e) => api.setSettings({ autostart: e.target.checked });
$('root').onchange = (e) => api.setSettings({ driveRoot: e.target.value.trim() });
$('iv').onchange = (e) => api.setSettings({ intervalMin: Number(e.target.value) || 10 });
$('tok').onchange = (e) => { api.setSettings({ githubToken: e.target.value.trim() }); e.target.value = ''; e.target.placeholder = '저장됨'; };
$('pick').onclick = async () => { const p = await api.pickFolder(); if (p) api.setSettings({ driveRoot: p }); };
$('apps').onclick = () => api.openAppsFile();
$('reload').onclick = () => api.reloadApps();

api.onState((s) => { S = s; render(); });
api.getState().then((s) => { S = s; render(); });
