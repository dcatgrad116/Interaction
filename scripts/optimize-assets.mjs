// 素材壓縮腳本：把 Figma 下載的大圖轉成適合手機載入的 WebP
// 執行方式：npm run assets
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'figma-assets';
const OUT = 'public/assets';
await mkdir(OUT, { recursive: true });

// 背景圖：原檔 30MB，縮到寬 1600 並轉 WebP（手機與大螢幕共用）
await sharp(`${SRC}/bg.png`).resize({ width: 1600 }).webp({ quality: 72 }).toFile(`${OUT}/bg.webp`);

// Logo：縮到寬 720 就夠清楚
await sharp(`${SRC}/logo.png`).trim().resize({ width: 720 }).webp({ quality: 85 }).toFile(`${OUT}/logo.webp`);

// 星星線：檔案本來就小，直接轉 WebP
await sharp(`${SRC}/starline.png`).webp({ quality: 90 }).toFile(`${OUT}/starline.webp`);

// 5 隻小夥伴：先裁掉四周透明留白（trim），再縮到 640 並保留透明背景
const chars = ['char1-tuantuan', 'char2-shanshan', 'char3-yuanyuan', 'char4-cici', 'char5-fangfang'];
for (const name of chars) {
  await sharp(`${SRC}/${name}.png`)
    .trim()
    .resize({ width: 640, height: 640, fit: 'inside' })
    .webp({ quality: 85, alphaQuality: 90 })
    .toFile(`${OUT}/${name}.webp`);
}

console.log('素材壓縮完成 →', OUT);
