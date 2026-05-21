#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const runtimeRoot = path.join(root, '.medialens-runtime');
const transcodeRoot = path.join(runtimeRoot, 'transcode');
fs.mkdirSync(transcodeRoot, { recursive: true });

const mime = new Map([
  ['.html','text/html; charset=utf-8'], ['.js','text/javascript; charset=utf-8'], ['.css','text/css; charset=utf-8'],
  ['.json','application/json; charset=utf-8'], ['.svg','image/svg+xml'], ['.png','image/png'], ['.jpg','image/jpeg'], ['.jpeg','image/jpeg'], ['.webp','image/webp'],
  ['.m3u8','application/vnd.apple.mpegurl; charset=utf-8'], ['.ts','video/mp2t'], ['.m4s','video/iso.segment'], ['.mp4','video/mp4'], ['.aac','audio/aac'], ['.mp3','audio/mpeg'], ['.vtt','text/vtt; charset=utf-8']
]);

function send(res, code, body, headers={}) { res.writeHead(code, headers); res.end(body); }
function sendJson(res, code, data, headers={}) { send(res, code, JSON.stringify(data), { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*', ...headers }); }
function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const resolved = path.resolve(root, clean);
  if (!resolved.startsWith(root)) return null;
  return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? path.join(resolved, 'index.html') : resolved;
}
function parseJsObjectFile(file, globalName) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8').trim();
  const prefix = `window.${globalName} = `;
  if (!text.startsWith(prefix)) return null;
  const json = text.slice(prefix.length).replace(/;\s*$/, '');
  try { return JSON.parse(json); } catch { return null; }
}
function readJson(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function loadSourceIndex() {
  const sources = [];
  const manifest = readJson('SOURCE_MANIFEST.json') || readJson('data/SOURCE_MANIFEST.json') || readJson('data/sources.json');
  if (manifest) sources.push(...(Array.isArray(manifest) ? manifest : (manifest.sources || [])));
  const imported = readJson('data/generated/imported-iptv-sources.json') || parseJsObjectFile('assets/imported-iptv-catalog.js', 'MEDIALENS_IMPORTED_IPTV');
  if (imported) sources.push(...(imported.sources || []));
  const byId = new Map();
  for (const s of sources) if (s?.id) byId.set(String(s.id), s);
  return byId;
}
let sourceIndex = loadSourceIndex();
function sourceHeaders(sourceId, target) {
  const source = sourceId ? sourceIndex.get(sourceId) : null;
  const requestHeaders = source?.delivery?.request_headers || source?.request_headers || {};
  const headers = {
    'User-Agent': requestHeaders['User-Agent'] || requestHeaders['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 MediaLens/30.7',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'Connection': 'close'
  };
  const referer = requestHeaders.Referer || requestHeaders.referer || requestHeaders['http-referrer'] || source?.http_referrer || source?.referer;
  const origin = requestHeaders.Origin || requestHeaders.origin;
  if (referer) {
    headers.Referer = referer;
    // Only send Origin when the playlist/source explicitly provided one. Many IPTV
    // endpoints accept VLC/IPTVnator-style requests but reject synthetic browser
    // Origin headers, so do not invent one from the target URL.
    if (origin) headers.Origin = origin;
  } else if (origin) {
    headers.Origin = origin;
  }
  return headers;
}
function ffmpegHeaderString(sourceId, target) {
  const headers = sourceHeaders(sourceId, target);
  return Object.entries(headers)
    .filter(([k]) => !['Accept-Encoding','Connection'].includes(k))
    .map(([k,v]) => `${k}: ${v}`)
    .join('\r\n') + '\r\n';
}
function fetchUrl(target, sourceId='', redirects=0, inboundHeaders={}) {
  return new Promise((resolve, reject) => {
    const lib = target.startsWith('https:') ? https : http;
    const headers = sourceHeaders(sourceId, target);
    if (inboundHeaders.range) headers.Range = inboundHeaders.range;
    const req = lib.get(target, { headers }, (r) => {
      if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location && redirects < 6) {
        const next = new URL(r.headers.location, target).toString();
        r.resume(); resolve(fetchUrl(next, sourceId, redirects+1, inboundHeaders)); return;
      }
      const chunks=[]; r.on('data', c=>chunks.push(c)); r.on('end', ()=>resolve({ status:r.statusCode||200, headers:r.headers, body:Buffer.concat(chunks), finalUrl:target }));
    });
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}
function proxyUrl(u, sourceId='') {
  return `/api/stream-proxy?url=${encodeURIComponent(u)}${sourceId ? `&source=${encodeURIComponent(sourceId)}` : ''}`;
}
function absolutizeUri(u, base, sourceId='') {
  try { return proxyUrl(new URL(u, base).toString(), sourceId); } catch { return u; }
}
function rewritePlaylistLine(line, base, sourceId='') {
  const t = line.trim();
  if (!t) return line;
  if (t.startsWith('#')) {
    return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${absolutizeUri(u, base, sourceId)}"`);
  }
  const [urlPart, ...pipeParts] = t.split('|');
  const rewritten = absolutizeUri(urlPart, base, sourceId);
  // Browser players do not understand VLC pipe options. Preserve URL-only playback and
  // keep real headers in source metadata for the proxy/transcoder.
  return rewritten;
}
async function proxy(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, '', { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,HEAD,OPTIONS', 'Access-Control-Allow-Headers':'Range,Content-Type' });
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const target = requestUrl.searchParams.get('url');
  const sourceId = requestUrl.searchParams.get('source') || '';
  if (!target || !/^https?:\/\//i.test(target)) return send(res, 400, 'Missing or invalid url');
  try {
    if (!sourceIndex.size) sourceIndex = loadSourceIndex();
    const upstream = await fetchUrl(target, sourceId, 0, req.headers || {});
    const type = String(upstream.headers['content-type'] || 'application/octet-stream');
    const looksPlaylist = /mpegurl|m3u8|text\/plain/i.test(type) || /\.m3u8(\?|$)/i.test(target);
    const cors = { 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' };
    if (looksPlaylist) {
      const text = upstream.body.toString('utf8');
      const rewritten = text.split(/\r?\n/).map(line => rewritePlaylistLine(line, upstream.finalUrl, sourceId)).join('\n');
      return send(res, upstream.status, rewritten, { ...cors, 'Content-Type':'application/vnd.apple.mpegurl; charset=utf-8' });
    }
    const headers = { ...cors, 'Content-Type': type };
    if (upstream.headers['content-length']) headers['Content-Length'] = upstream.headers['content-length'];
    if (upstream.headers['accept-ranges']) headers['Accept-Ranges'] = upstream.headers['accept-ranges'];
    if (upstream.headers['content-range']) headers['Content-Range'] = upstream.headers['content-range'];
    res.writeHead(upstream.status, headers);
    if (req.method === 'HEAD') res.end(); else res.end(upstream.body);
  } catch (err) {
    send(res, 502, `MediaLens stream proxy failed: ${err.message}`, { 'Access-Control-Allow-Origin':'*' });
  }
}

const transcodeSessions = new Map();
function commandExists(cmd) {
  return new Promise(resolve => {
    const p = spawn(cmd, ['-version'], { stdio:'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', code => resolve(code === 0));
  });
}
function sessionIdFor(target, sourceId='') {
  return crypto.createHash('sha1').update(`${sourceId}\n${target}`).digest('hex').slice(0, 16);
}
function cleanupSession(id) {
  const session = transcodeSessions.get(id);
  if (session?.proc && !session.proc.killed) { try { session.proc.kill('SIGTERM'); } catch {} }
  transcodeSessions.delete(id);
}
function cleanupOldSessions(maxAgeMs = 2 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const [id, session] of transcodeSessions) if (now - session.startedAt > maxAgeMs) cleanupSession(id);
}
function playlistReadyWithSegment(file) {
  if (!fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('#EXTM3U') || !text.includes('#EXTINF')) return false;
  const dir = path.dirname(file);
  const segmentLines = text.split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('#'));
  const localSegment = segmentLines.find(x => !/^https?:\/\//i.test(x));
  if (!localSegment) return true;
  const segmentFile = path.resolve(dir, localSegment.split('?')[0]);
  return segmentFile.startsWith(dir) && fs.existsSync(segmentFile) && fs.statSync(segmentFile).size > 0;
}
function waitForPlaylist(file, timeoutMs=30000) {
  const start = Date.now();
  return new Promise(resolve => {
    const tick = () => {
      if (playlistReadyWithSegment(file)) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 350);
    };
    tick();
  });
}
async function startTranscode(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, '', { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' });
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const target = requestUrl.searchParams.get('url');
  const sourceId = requestUrl.searchParams.get('source') || '';
  if (!target || !/^https?:\/\//i.test(target)) return sendJson(res, 400, { ok:false, error:'missing_or_invalid_url' });
  if (!(await commandExists('ffmpeg'))) return sendJson(res, 503, { ok:false, error:'ffmpeg_not_available', message:'Installeer FFmpeg of gebruik de directe HLS-proxy.' });
  cleanupOldSessions();
  if (!sourceIndex.size) sourceIndex = loadSourceIndex();
  const id = sessionIdFor(target, sourceId);
  const outDir = path.join(transcodeRoot, id);
  const playlist = path.join(outDir, 'live.m3u8');
  const existing = transcodeSessions.get(id);
  if (existing && fs.existsSync(playlist)) return sendJson(res, 200, { ok:true, id, mode:'existing', playlist:`/api/transcode/${id}/live.m3u8` });
  cleanupSession(id);
  fs.rmSync(outDir, { recursive:true, force:true });
  fs.mkdirSync(outDir, { recursive:true });
  const logFile = path.join(outDir, 'ffmpeg.log');
  const headerString = ffmpegHeaderString(sourceId, target);
  const args = [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-rw_timeout', '15000000',
    '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
    '-allowed_extensions', 'ALL',
    '-user_agent', sourceHeaders(sourceId, target)['User-Agent'],
    '-headers', headerString,
    '-analyzeduration', '10000000', '-probesize', '10000000',
    '-fflags', '+genpts+discardcorrupt',
    '-i', target,
    '-map', '0:v:0?', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-f', 'hls', '-hls_time', '2', '-hls_list_size', '8', '-hls_delete_threshold', '16',
    '-hls_flags', 'independent_segments+program_date_time+temp_file',
    '-hls_segment_filename', 'seg_%05d.ts', playlist
  ];
  const log = fs.createWriteStream(logFile, { flags:'a' });
  const proc = spawn('ffmpeg', args, { cwd: outDir, stdio:['ignore','ignore','pipe'] });
  proc.stderr.pipe(log);
  transcodeSessions.set(id, { id, target, sourceId, proc, outDir, playlist, startedAt: Date.now() });
  proc.on('close', code => {
    const s = transcodeSessions.get(id);
    if (s) s.exitCode = code;
  });
  const ready = await waitForPlaylist(playlist);
  if (!ready) {
    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-8).join('\n') : '';
    cleanupSession(id);
    return sendJson(res, 502, { ok:false, error:'transcode_start_timeout', message:'FFmpeg kon niet snel genoeg een browsercompatibele liveplaylist maken.', log: tail.slice(-1200) });
  }
  return sendJson(res, 200, { ok:true, id, mode:'transcoded-hls', playlist:`/api/transcode/${id}/live.m3u8` });
}
function serveTranscodeAsset(req, res) {
  const match = req.url.match(/^\/api\/transcode\/([a-f0-9]{16})\/([^?]+)/);
  if (!match) return send(res, 404, 'Not found');
  const [, id, fileNameRaw] = match;
  const fileName = path.basename(decodeURIComponent(fileNameRaw));
  const file = path.join(transcodeRoot, id, fileName);
  if (!file.startsWith(path.join(transcodeRoot, id)) || !fs.existsSync(file)) return send(res, 404, 'Not ready');
  const ext = path.extname(file).toLowerCase();
  const headers = { 'Content-Type': mime.get(ext) || 'application/octet-stream', 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' };
  fs.createReadStream(file).on('error', () => send(res, 404, 'Not found')).pipe(res.writeHead(200, headers));
}
function stopTranscode(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const id = requestUrl.searchParams.get('id') || '';
  if (!/^[a-f0-9]{16}$/.test(id)) return sendJson(res, 400, { ok:false, error:'invalid_id' });
  cleanupSession(id);
  return sendJson(res, 200, { ok:true, id });
}
function transcodeStatus(req, res) {
  return sendJson(res, 200, { ok:true, ffmpeg_available:true, active:[...transcodeSessions.values()].map(s => ({ id:s.id, source:s.sourceId, age_ms:Date.now()-s.startedAt, exitCode:s.exitCode ?? null })) });
}
async function streamDiagnose(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const target = requestUrl.searchParams.get('url');
  const sourceId = requestUrl.searchParams.get('source') || '';
  if (!target || !/^https?:\/\//i.test(target)) return sendJson(res, 400, { ok:false, error:'missing_or_invalid_url' });
  try {
    const upstream = await fetchUrl(target, sourceId, 0, {});
    const type = String(upstream.headers['content-type'] || '');
    const bodyHead = upstream.body.subarray(0, 240).toString('utf8');
    return sendJson(res, 200, {
      ok: upstream.status >= 200 && upstream.status < 400,
      status: upstream.status,
      finalUrl: upstream.finalUrl,
      contentType: type,
      looksPlaylist: /#EXTM3U/.test(bodyHead) || /mpegurl|m3u8/i.test(type),
      usedSyntheticOrigin: false,
      requestHeaders: sourceHeaders(sourceId, target),
      preview: bodyHead.replace(/[\r\n]+/g, ' ').slice(0, 180)
    });
  } catch (err) {
    return sendJson(res, 502, { ok:false, error:'diagnose_failed', message:err.message });
  }
}

async function streamFmp4(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, '', { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type,Range' });
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const target = requestUrl.searchParams.get('url');
  const sourceId = requestUrl.searchParams.get('source') || '';
  if (!target || !/^https?:\/\//i.test(target)) return send(res, 400, 'Missing or invalid url', { 'Access-Control-Allow-Origin':'*' });
  if (!(await commandExists('ffmpeg'))) return send(res, 503, 'FFmpeg is not available', { 'Access-Control-Allow-Origin':'*' });
  if (!sourceIndex.size) sourceIndex = loadSourceIndex();

  const headers = sourceHeaders(sourceId, target);
  const headerString = ffmpegHeaderString(sourceId, target);
  const args = [
    '-hide_banner', '-nostdin', '-loglevel', 'warning',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-rw_timeout', '15000000',
    '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,data',
    '-allowed_extensions', 'ALL',
    '-user_agent', headers['User-Agent'],
    '-headers', headerString,
    '-analyzeduration', '10000000', '-probesize', '10000000',
    '-fflags', '+genpts+discardcorrupt',
    '-i', target,
    '-map', '0:v:0?', '-map', '0:a:0?', '-sn', '-dn',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
    '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-frag_duration', '1000000',
    '-f', 'mp4', 'pipe:1'
  ];
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'X-MediaLens-Playback': 'ffmpeg-fmp4'
  });
  const proc = spawn('ffmpeg', args, { stdio:['ignore','pipe','pipe'] });
  let stderr = '';
  proc.stdout.pipe(res);
  proc.stderr.on('data', chunk => {
    stderr += chunk.toString();
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });
  const kill = () => { if (!proc.killed) { try { proc.kill('SIGTERM'); } catch {} } };
  req.on('close', kill);
  res.on('close', kill);
  proc.on('error', err => {
    if (!res.headersSent) send(res, 502, `MediaLens FFmpeg stream failed: ${err.message}`, { 'Access-Control-Allow-Origin':'*' });
    else { try { res.end(); } catch {} }
  });
  proc.on('close', code => {
    if (code && code !== 255) console.warn(`MediaLens fMP4 transcode ended with code ${code}: ${stderr.split(/\r?\n/).slice(-3).join(' | ')}`);
    try { res.end(); } catch {}
  });
}

async function playerHealth(req, res) {
  const ffmpeg_available = await commandExists('ffmpeg');
  const hlsBundled = fs.existsSync(path.join(root, 'assets/vendor/hls.min.js'));
  return sendJson(res, 200, {
    ok: true,
    ffmpeg_available,
    hls_js_bundled: hlsBundled,
    endpoints: {
      fmp4: '/api/transcode/fmp4?url=',
      hls: '/api/transcode/start?url=',
      proxy: '/api/stream-proxy?url='
    },
    note: 'MediaLens uses the local HLS transcode player server first for IPTV/FAST imports, then falls back to fMP4/proxy when needed. This avoids browser HLS/CORS/codec limitations while keeping playback inside MediaLens.'
  });
}

const server = http.createServer((req,res) => {
  if (req.url?.startsWith('/api/stream-proxy')) return proxy(req,res);
  if (req.url?.startsWith('/api/transcode/fmp4')) return streamFmp4(req,res);
  if (req.url?.startsWith('/api/transcode/start')) return startTranscode(req,res);
  if (req.url?.startsWith('/api/transcode/stop')) return stopTranscode(req,res);
  if (req.url?.startsWith('/api/transcode/status')) return transcodeStatus(req,res);
  if (req.url?.startsWith('/api/player-health')) return playerHealth(req,res);
  if (req.url?.startsWith('/api/stream-diagnose')) return streamDiagnose(req,res);
  if (req.url?.startsWith('/api/transcode/')) return serveTranscodeAsset(req,res);
  const file = safePath(req.url || '/');
  if (!file || !fs.existsSync(file)) return send(res, 404, 'Not found');
  const ext = path.extname(file).toLowerCase();
  let body = fs.readFileSync(file);
  if (path.basename(file) === 'index.html') {
    const inject = `<script>window.MEDIALENS_STREAM_PROXY='/api/stream-proxy?url=';window.MEDIALENS_TRANSCODE_START='/api/transcode/start';window.MEDIALENS_TRANSCODE_FMP4='/api/transcode/fmp4';</script>`;
    body = Buffer.from(body.toString('utf8').replace('</head>', `${inject}\n</head>`));
  }
  const headers = { 'Content-Type': mime.get(ext) || 'application/octet-stream' };
  if (path.basename(file) === 'index.html' || path.basename(file) === 'app.js' || path.basename(file) === 'service-worker.js') {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
    headers['Pragma'] = 'no-cache';
  }
  send(res, 200, body, headers);
});
process.on('exit', () => { for (const id of transcodeSessions.keys()) cleanupSession(id); });
process.on('SIGTERM', () => { for (const id of transcodeSessions.keys()) cleanupSession(id); process.exit(0); });
process.on('SIGINT', () => { for (const id of transcodeSessions.keys()) cleanupSession(id); process.exit(0); });
server.listen(port, host, () => console.log(`MediaLens player server running at http://${host}:${port}`));
