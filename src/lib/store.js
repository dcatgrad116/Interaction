// 資料層：把「送出作品／接收作品／刪除作品」包成幾個函式
// 有填 Firebase 設定（.env）就用 Firestore，沒填就用本機測試後端
// 這樣畫面程式不用管資料存在哪裡，之後換後端只要改這個檔案
//
// 為了不用綁信用卡，圖片不放 Firebase Storage，而是壓縮後直接存在 Firestore 文件裡
import { firebaseConfig, hasFirebase } from './firebaseConfig.js';
import { compressArtwork } from './compressImage.js';

export const NAME_MAX = 10; // 暱稱字數上限（設計稿：限 10 字內）
export const MESSAGE_MAX = 20; // 一句話的字數上限（大螢幕字幕條放得下的長度）
const SCREEN_LIMIT = 200; // 大螢幕／管理頁最多抓最新幾件作品

let fb = null; // Firebase 相關模組，需要時才載入，減少手機首次載入量
async function getFirebase() {
  if (fb) return fb;
  const [{ initializeApp }, fs, auth] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
    import('firebase/auth'),
  ]);
  const app = initializeApp(firebaseConfig);
  fb = { fs, auth, db: fs.getFirestore(app), authInst: auth.getAuth(app) };
  return fb;
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * 送出作品
 * @param {{ image: string, name: string, message: string, character: string }} work
 *   image 是編輯器輸出的 PNG dataURL（透明背景）
 */
export async function submitWork(work) {
  const image = await compressArtwork(work.image); // 先壓小再上傳
  const data = {
    image,
    name: work.name.slice(0, NAME_MAX),
    message: work.message.slice(0, MESSAGE_MAX),
    character: work.character,
  };

  if (!hasFirebase) {
    const res = await fetch('/api/works', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('上傳失敗');
    return res.json();
  }

  const { fs, db } = await getFirebase();
  const id = newId();
  await fs.setDoc(fs.doc(db, 'works', id), { ...data, createdAt: fs.serverTimestamp() });
  return { id };
}

/**
 * 訂閱作品清單：有新作品或被刪除時，callback 會收到最新的完整清單（舊 → 新）
 * 每件作品的 imageUrl 可以直接放進 <img src>
 * 回傳一個「取消訂閱」函式
 */
export function subscribeWorks(callback) {
  if (!hasFirebase) {
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => callback(JSON.parse(e.data));
    return () => es.close();
  }
  let unsub = () => {};
  let cancelled = false;
  getFirebase().then(({ fs, db }) => {
    if (cancelled) return;
    // 只抓最新的 SCREEN_LIMIT 件（每件含圖片，全部抓會很大）
    const q = fs.query(fs.collection(db, 'works'), fs.orderBy('createdAt', 'desc'), fs.limit(SCREEN_LIMIT));
    unsub = fs.onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const { image, createdAt, ...rest } = d.data();
        // serverTimestamp 剛寫入時可能還是 null，先用現在時間代替
        return { id: d.id, ...rest, imageUrl: image, createdAt: createdAt?.toMillis?.() ?? Date.now() };
      });
      callback(list.reverse()); // 轉成舊 → 新，跟本機模式一致
    });
  });
  return () => { cancelled = true; unsub(); };
}

/** 刪除作品（管理頁使用；Firebase 模式需要先用管理員帳號登入） */
export async function deleteWork(id) {
  if (!hasFirebase) {
    await fetch(`/api/works/${id}`, { method: 'DELETE' });
    return;
  }
  const { fs, db } = await getFirebase();
  await fs.deleteDoc(fs.doc(db, 'works', id));
}

// ---------- 管理員登入（只有 Firebase 模式需要） ----------

/** 監聽登入狀態，callback 收到目前登入的使用者（沒登入是 null） */
export function watchAdmin(callback) {
  if (!hasFirebase) {
    callback({ email: '本機測試模式（不需登入）' });
    return () => {};
  }
  let unsub = () => {};
  getFirebase().then(({ auth, authInst }) => {
    unsub = auth.onAuthStateChanged(authInst, callback);
  });
  return () => unsub();
}

/** 用 Google 帳號登入 */
export async function adminSignIn() {
  const { auth, authInst } = await getFirebase();
  await auth.signInWithPopup(authInst, new auth.GoogleAuthProvider());
}

/** 登出 */
export async function adminSignOut() {
  const { auth, authInst } = await getFirebase();
  await auth.signOut(authInst);
}

export const backendName = hasFirebase ? 'Firebase Firestore' : '本機測試模式';
export { hasFirebase };
