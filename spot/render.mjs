// Usage: node render.mjs <outDir> [fps=30] [start=0] [end=30] [workers=4]   |   node render.mjs <outDir> --times 0.5,3,10
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const [outDir, ...rest] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/index.html`;

let jobs;
if (rest[0] === '--times') jobs = rest[1].split(',').map(Number).map(t => ({ t, name: `t_${t.toFixed(2)}.png` }));
else {
  const fps = +(rest[0] || 30), start = +(rest[1] || 0), end = +(rest[2] || 30);
  jobs = []; for (let f = Math.round(start * fps); f < Math.round(end * fps); f++) jobs.push({ t: f / fps, name: `f_${String(f).padStart(4, '0')}.png` });
}
jobs = jobs.filter(j => !fs.existsSync(path.join(outDir, j.name)));
const workers = +(rest[3] || 4);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let done = 0; const t0 = Date.now();
async function worker(list) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('console:', m.text()); });
  await page.goto(url); await page.evaluate(() => window.ready);
  for (const j of list) {
    await page.evaluate(t => window.seek(t), j.t);
    await page.screenshot({ path: path.join(outDir, j.name) });
    if (++done % 30 === 0) console.log(`${done}/${jobs.length}  ${((Date.now() - t0) / done).toFixed(0)} ms/frame`);
  }
}
const chunks = Array.from({ length: workers }, (_, w) => jobs.filter((_, i) => i % workers === w));
await Promise.all(chunks.map(worker));
await browser.close(); server.close();
console.log('done', done, 'frames in', ((Date.now() - t0) / 1000).toFixed(1), 's');
