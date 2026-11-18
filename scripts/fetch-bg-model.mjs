// 下載去背模型的「備份」到 public/bg-removal/
// 平常 App 會從 IMG.LY 官方 CDN 下載模型；CDN 連不上時，改用這份放在自己網站上的備份
// 執行方式：npm run fetch-model（只需要做一次，約 56MB）
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const VERSION = '1.6.0'; // 要跟 @imgly/background-removal 的版本一致
const CDN = `https://staticimgly.com/@imgly/background-removal-data/${VERSION}/dist/`;
const OUT = 'public/bg-removal/';

// 只下載 CPU 模式＋最小模型需要的檔案（完整版有 360MB，用不到）
const NEEDED = [
  '/models/isnet_quint8',
  '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
];

await mkdir(OUT, { recursive: true });
const all = await (await fetch(CDN + 'resources.json')).json();

// 備份用的清單只留需要的檔案
const subset = Object.fromEntries(NEEDED.map((k) => [k, all[k]]));
await writeFile(OUT + 'resources.json', JSON.stringify(subset));

for (const key of NEEDED) {
  for (const chunk of all[key].chunks) {
    const file = OUT + chunk.name;
    if (existsSync(file)) continue; // 已經下載過就跳過
    const res = await fetch(CDN + chunk.name);
    if (!res.ok) throw new Error(`下載失敗：${key} ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    process.stdout.write('.');
  }
  console.log(` ${key} 完成`);
}
console.log('模型備份下載完成 →', OUT);
