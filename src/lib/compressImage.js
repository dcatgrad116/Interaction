// 作品圖壓縮：把編輯器輸出的大 PNG 壓小，才能直接存進 Firestore
// Firestore 每筆資料上限 1MB，這裡把圖片控制在 MAX_CHARS 以內，留空間給暱稱、留言等欄位

const MAX_SIDE = 600; // 長邊 600px：大螢幕放大顯示時也夠清楚
const MAX_CHARS = 700_000; // dataURL 字元數上限（約 700KB）

/** 把 dataURL 畫到指定大小的畫布上 */
async function drawScaled(dataUrl, maxSide) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * 壓縮作品圖（保留透明背景）
 * 優先用 WebP（檔案小）；手機瀏覽器不支援輸出 WebP 時改用 PNG，太大就再縮小
 * @param {string} dataUrl 編輯器輸出的 PNG
 * @returns {Promise<string>} 壓縮後的 dataURL
 */
export async function compressArtwork(dataUrl) {
  let side = MAX_SIDE;
  for (let i = 0; i < 6; i++) {
    const canvas = await drawScaled(dataUrl, side);
    // 有些瀏覽器（例如部分 iOS Safari）不支援輸出 WebP，會自動改給 PNG
    const webp = canvas.toDataURL('image/webp', 0.85);
    const out = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
    if (out.length <= MAX_CHARS) return out;
    side = Math.round(side * 0.8); // 還是太大 → 縮小 20% 再試
  }
  throw new Error('圖片壓縮後仍然太大');
}
