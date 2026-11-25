const fs = require('fs');
const path = require('path');

const SKIP = new Set(['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information']);

function scanFolder(dir, depth = 0, acc = { files: 0, newest: 0, recent: '', names: [] }) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth < 4) scanFolder(p, depth + 1, acc);
    } else {
      acc.files++;
      if (acc.names.length < 400) acc.names.push(e.name);
      try {
        const m = fs.statSync(p).mtimeMs;
        if (m > acc.newest) { acc.newest = m; acc.recent = e.name; }
      } catch {}
    }
  }
  return acc;
}

const etags = new Map();
const GH_TTL = 9 * 60 * 1000;

async function gh(url, token) {
  const headers = { 'User-Agent': 'appstatus-widget', Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const prev = etags.get(url);
  if (prev) headers['If-None-Match'] = prev.etag;
  const r = await fetch(url, { headers });
  if (r.status === 304 && prev) return prev.body;
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub ' + r.status + (r.status === 403 ? ' (요청 한도, 잠시 후 자동 복구)' : ''));
  const body = await r.json();
  const et = r.headers.get('etag');
  if (et) etags.set(url, { etag: et, body });
  return body;
}

async function scanRepo(repo, token, store) {
  const cached = store.repos[repo];
  if (cached && Date.now() - cached.at < GH_TTL) return cached.data;
  const out = { pushedAt: 0, release: '', releaseAt: 0, error: '' };
  try {
    const info = await gh(`https://api.github.com/repos/${repo}`, token);
    if (info) out.pushedAt = Date.parse(info.pushed_at) || 0;
    else out.error = '저장소를 찾을 수 없음(비공개면 토큰 필요)';
    const rel = await gh(`https://api.github.com/repos/${repo}/releases/latest`, token);
    if (rel) { out.release = rel.tag_name; out.releaseAt = Date.parse(rel.published_at) || 0; }
  } catch (e) { out.error = String(e.message || e); }
  if (out.error && cached) return { ...cached.data, error: out.error + ' · 이전 값 표시' };
  if (!out.error) store.repos[repo] = { at: Date.now(), data: out };
  return out;
}

function guessStatus(ev) {
  if (ev.repo && ev.repo.release) return 'green';
  if (ev.repo && ev.repo.pushedAt) return 'yellow';
  if (ev.folderFound && ev.files === 0) return 'red';
  if (ev.files > 0 && ev.names.every((n) => /motiv|기획|idea|아이디어|메모|조사/i.test(n))) return 'purple';
  return null;
}

async function collect(apps, settings, prevSnapshot, store) {
  store = store || { repos: {} };
  store.repos = store.repos || {};
  const root = settings.driveRoot;
  const result = [];
  for (const a of apps) {
    const ev = { folderFound: false, files: 0, newest: 0, recent: '', names: [], repo: null };
    if (a.folder && (root || path.isAbsolute(a.folder))) {
      const dir = path.isAbsolute(a.folder) ? a.folder : path.join(root, a.folder);
      if (fs.existsSync(dir)) {
        ev.folderFound = true;
        const s = scanFolder(dir);
        Object.assign(ev, { files: s.files, newest: s.newest, recent: s.recent, names: s.names });
      }
    }
    if (a.repo) ev.repo = await scanRepo(a.repo, settings.githubToken, store);
    const last = Math.max(ev.newest, ev.repo ? Math.max(ev.repo.pushedAt, ev.repo.releaseAt) : 0);
    result.push({
      ...a,
      lastActivity: last ? new Date(last).toISOString() : (a.lastActivity || ''),
      evidence: { files: ev.files, recent: ev.recent, folderFound: ev.folderFound, drive: ev.newest,
        release: ev.repo ? ev.repo.release : '', pushedAt: ev.repo ? ev.repo.pushedAt : 0, releaseAt: ev.repo ? ev.repo.releaseAt : 0,
        error: ev.repo ? ev.repo.error : '' },
      suggest: guessStatus(ev),
    });
  }
  const prev = prevSnapshot && prevSnapshot.v === 2 ? prevSnapshot.apps : null;
  const changes = [];
  const now = Date.now();
  if (prev) {
    for (const r of result) {
      const p = prev[r.id];
      if (!p) continue;
      if (p.status !== r.status) changes.push({ at: now, text: `${r.name}: 상태 ${p.status} → ${r.status}` });
      if (r.evidence.drive && p.drive && r.evidence.drive > p.drive)
        changes.push({ at: now, text: `${r.name}: 파일 변경 (${r.evidence.recent})` });
      if (r.evidence.pushedAt && p.gh && Math.max(r.evidence.pushedAt, r.evidence.releaseAt) > p.gh)
        changes.push({ at: now, text: `${r.name}: GitHub ${r.evidence.release && r.evidence.releaseAt > r.evidence.pushedAt ? '릴리스 ' + r.evidence.release : '푸시'}` });
    }
  }
  const snapshot = { v: 2, apps: Object.fromEntries(result.map((r) => [r.id, {
    status: r.status, drive: r.evidence.drive || 0,
    gh: Math.max(r.evidence.pushedAt || 0, r.evidence.releaseAt || 0),
  }])) };
  return { apps: result, newChanges: changes, snapshot, collectedAt: now, baseline: !prev };
}

module.exports = { collect };
