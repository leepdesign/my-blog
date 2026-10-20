import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif' };

async function rebuild() {
  try {
    // Fresh import each time so edits to build.js apply without restarting
    const { build } = await import(`./build.js?t=${Date.now()}`);
    const n = await build();
    console.log(`[${new Date().toLocaleTimeString()}] 已重新生成（${n} 篇）`);
  } catch (e) {
    console.error('生成失败：', e.message);
  }
}

await rebuild();

let timer;
for (const target of ['posts', 'content', 'static', 'site.config.js', 'build.js']) {
  fs.watch(path.join(ROOT, target), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 100);
  });
}

http.createServer((req, res) => {
  let file = path.join(OUT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(OUT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    fs.createReadStream(path.join(OUT, '404.html')).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`本地预览：http://localhost:${PORT}`));
