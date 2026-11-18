// 自動去背：在手機瀏覽器裡直接跑 AI 模型，不需要自己的伺服器
// 套件：@imgly/background-removal（AGPL 授權，展覽使用沒問題）
//
// 模型約 56MB，第一次使用時下載，之後瀏覽器會快取
// 下載來源：先用 IMG.LY 官方 CDN；連不上時改用我們網站上的備份（public/bg-removal/）

let lib = null; // 套件很大，等真的要用時才載入
let useBackup = false; // CDN 失敗過一次後，之後都直接用備份

const BACKUP_PATH = new URL('/bg-removal/', location.origin).href;

// 共用設定
const baseConfig = () => ({
  model: 'isnet_quint8', // 最小的模型，適合手機
  device: 'cpu',
  ...(useBackup ? { publicPath: BACKUP_PATH } : {}),
});

async function loadLib() {
  lib = lib || (await import('@imgly/background-removal'));
  return lib;
}

// 先在背景下載模型，讓使用者真的按下去時比較快
export async function preloadRemoveBg() {
  try {
    await (await loadLib()).preload(baseConfig());
  } catch {
    // CDN 下載失敗 → 改用備份再預載一次
    useBackup = true;
    try { await lib.preload(baseConfig()); } catch { /* 真正去背時會再試 */ }
  }
}

/**
 * 把圖片去背，回傳透明背景 PNG 的 Blob
 * @param {Blob} file 使用者選的照片
 * @param {(percent:number)=>void} onProgress 下載模型的進度（0~100）
 */
export async function removeBg(file, onProgress) {
  await loadLib();
  const small = await shrinkImage(file, 1024); // 先縮小，手機跑比較快、也比較不會當掉
  const run = () =>
    lib.removeBackground(small, {
      ...baseConfig(),
      output: { format: 'image/png' },
      // 只回報「下載模型」的進度；下載完之後是運算階段，交給畫面顯示等待文字
      progress: (key, current, total) => {
        if (onProgress && total && key.startsWith('fetch')) onProgress(Math.round((current / total) * 100));
      },
    });

  try {
    return await run();
  } catch (err) {
    if (useBackup) throw err; // 已經在用備份還是失敗，就真的失敗了
    console.warn('CDN 下載模型失敗，改用網站備份', err);
    useBackup = true;
    return run();
  }
}

/** 把照片長邊縮到 maxSize 以內（手機原圖常常 4000px 以上） */
export async function shrinkImage(file, maxSize) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob(ok, 'image/png'));
}
