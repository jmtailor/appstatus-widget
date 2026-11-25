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

async function gh(url, token) {
  const headers = { 'User-Agent': 'appstatus-widget', Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return r.json();
}

async function scanRepo(repo, token) {
  const out = { pushedAt: 0, release: '', releaseAt: 0, error: '' };
  try {
    const info = await gh(`https://api.github.com/repos/${repo}`, token);
    if (info) out.pushedAt = Date.parse(info.pushed_at) || 0;
    else out.error = '저장소를 찾을 수 없음(비공개면 토큰 필요)';
    const rel = await gh(`https://api.github.com/repos/${repo}/releases/latest`, token);
    if (rel) { out.release = rel.tag_name; out.releaseAt = Date.parse(rel.published_at) || 0; }
  } catch (e) { out.error = String(e.message || e); }
  return out;
}

function guessStatus(ev) {
  if (ev.repo && ev.repo.release) return 'green';
  if (ev.repo && ev.repo.pushedAt) return 'yellow';
  if (ev.folderFound && ev.files === 0) return 'red';
  if (ev.files > 0 && ev.names.every((n) => /motiv|기획|idea|아이디어|메모|조사/i.test(n))) return 'purple';
  return null;
}

async function collect(apps, settings, prevSnapshot) {
  const root = settings.driveRoot;
  const result = [];
  for (const a of apps) {
    const ev = { folderFound: false, files: 0, newest: 0, recent: '', names: [], repo: null };
    if (root && a.folder) {
      const dir = path.join(root, a.folder);
      if (fs.existsSync(dir)) {
        ev.folderFound = true;
        const s = scanFolder(dir);
        Object.assign(ev, { files: s.files, newest: s.newest, recent: s.recent, names: s.names });
      }
    }
    if (a.repo) ev.repo = await scanRepo(a.repo, settings.githubToken);
    const last = Math.max(ev.newest, ev.repo ? Math.max(ev.repo.pushedAt, ev.repo.releaseAt) : 0);
    result.push({
      ...a,
      lastActivity: last ? new Date(last).toISOString() : (a.lastActivity || ''),
      evidence: { files: ev.files, recent: ev.recent, folderFound: ev.folderFound,
        release: ev.repo ? ev.repo.release : '', pushedAt: ev.repo ? ev.repo.pushedAt : 0,
        error: ev.repo ? ev.repo.error : '' },
      suggest: guessStatus(ev),
    });
  }
  const prev = (prevSnapshot && prevSnapshot.apps) || {};
  const changes = [];
  const now = Date.now();
  for (const r of result) {
    const p = prev[r.id];
    if (!p) continue;
    if (p.status !== r.status) changes.push({ at: now, text: `${r.name}: 상태 ${p.status} → ${r.status}` });
    if (r.lastActivity && p.lastActivity && r.lastActivity !== p.lastActivity) {
      const what = r.evidence.recent ? `파일 변경 (${r.evidence.recent})` : (r.evidence.release || '저장소 활동');
      changes.push({ at: now, text: `${r.name}: ${what}` });
    }
  }
  const snapshot = { apps: Object.fromEntries(result.map((r) => [r.id, { status: r.status, lastActivity: r.lastActivity }])) };
  return { apps: result, newChanges: changes, snapshot, collectedAt: now };
}

module.exports = { collect };
