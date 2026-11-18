// 本機測試用後端（只在 npm run dev 時運作）
// 功能：收作品、刪除作品、即時推播最新清單給大螢幕和管理頁
// 資料存在專案底下的 .local-data 資料夾，重開伺服器也不會消失
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, watchFile } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = '.local-data';
const DB_FILE = join(DATA_DIR, 'works.json');
const TYPES = { png: 'image/png', webp: 'image/webp' };

export function localApi() {
  mkdirSync(DATA_DIR, { recursive: true });
  // 作品清單以硬碟上的 works.json 為準（同時開好幾個伺服器時，資料才會一致）
  const load = () => {
    try { return existsSync(DB_FILE) ? JSON.parse(readFileSync(DB_FILE, 'utf8')) : []; }
    catch { return works; } // 檔案寫到一半時讀不到，先用舊的
  };
  let works = [];
  works = load();
  const save = () => writeFileSync(DB_FILE, JSON.stringify(works, null, 2));
  // 目前連線中的大螢幕／管理頁（Server-Sent Events）
  const clients = new Set();
  const broadcast = () => {
    const payload = `data: ${JSON.stringify(works)}\n\n`;
    clients.forEach((res) => res.write(payload));
  };
  // works.json 被別的伺服器改了 → 重新讀取並通知大螢幕
  watchFile(DB_FILE, { interval: 500 }, () => {
    works = load();
    broadcast();
  });

  // 讀取 POST 進來的 JSON 內容
  const readBody = (req) =>
    new Promise((ok, fail) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        try { ok(JSON.parse(raw)); } catch (e) { fail(e); }
      });
    });

  // 找到作品對應的圖片檔（png 或 webp）
  const imageFile = (id) =>
    Object.keys(TYPES).map((ext) => join(DATA_DIR, `${id}.${ext}`)).find((f) => existsSync(f));

  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://x');

        // 即時推播：大螢幕連上後持續收到最新清單
        if (url.pathname === '/api/stream') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          res.write(`data: ${JSON.stringify(works)}\n\n`);
          clients.add(res);
          req.on('close', () => clients.delete(res));
          return;
        }

        // 新增作品：收到 dataURL 圖片，依格式存成 png 或 webp 檔
        if (url.pathname === '/api/works' && req.method === 'POST') {
          try {
            const body = await readBody(req);
            const match = String(body.image).match(/^data:image\/(png|webp);base64,(.+)$/);
            if (!match) throw new Error('圖片格式不對');
            const [, ext, base64] = match;
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            writeFileSync(join(DATA_DIR, `${id}.${ext}`), Buffer.from(base64, 'base64'));
            const work = {
              id,
              name: String(body.name || '').slice(0, 10),
              message: String(body.message || '').slice(0, 20),
              character: body.character,
              imageUrl: `/api/img/${id}`,
              createdAt: Date.now(),
            };
            works = load(); // 先讀最新的，避免蓋掉別的伺服器剛存的作品
            works.push(work);
            save();
            broadcast();
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(work));
          } catch (e) {
            res.statusCode = 400;
            return res.end('bad request');
          }
        }

        // 刪除作品（管理頁使用）
        const del = url.pathname.match(/^\/api\/works\/(\w+)$/);
        if (del && req.method === 'DELETE') {
          works = load().filter((w) => w.id !== del[1]);
          const file = imageFile(del[1]);
          if (file) unlinkSync(file);
          save();
          broadcast();
          return res.end('ok');
        }

        // 讀取作品圖片（相容舊網址 /api/img/xxx.png）
        const img = url.pathname.match(/^\/api\/img\/(\w+)(?:\.\w+)?$/);
        if (img) {
          const file = imageFile(img[1]);
          if (!file) { res.statusCode = 404; return res.end(); }
          res.setHeader('Content-Type', TYPES[file.split('.').pop()]);
          return res.end(readFileSync(file));
        }

        next();
      });
    },
  };
}
