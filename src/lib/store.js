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

// ---------- 管理：垃圾桶與操作紀錄 ----------
// 刪除不是真的刪掉，而是把作品「搬」到垃圾桶（trash），之後可以復原
// 每次刪除、復原、永久刪除都會在 logs 留一筆紀錄：誰、什麼時候、對哪件作品做了什麼
// Firebase 模式用「批次寫入」：搬家＋刪原本的＋寫紀錄，要嘛全部成功、要嘛全部不做

// 本機模式的小工具：送出請求，失敗就丟出錯誤
async function localCall(url, method) {
  const res = await fetch(url, { method });
  if (!res.ok) throw new Error(await res.text());
}

// 目前登入的管理員信箱（寫進紀錄用）
const adminEmail = () => fb?.authInst.currentUser?.email ?? '';

// 寫一筆操作紀錄到批次裡
function addLog(batch, { fs, db }, action, workId, workName) {
  batch.set(fs.doc(db, 'logs', newId()), {
    action, // 'delete' 刪除｜'restore' 復原｜'purge' 永久刪除
    workId,
    workName,
    by: adminEmail(),
    at: fs.serverTimestamp(),
  });
}

/** 刪除作品：移到垃圾桶（大螢幕上立刻消失，但之後還能復原） */
export async function deleteWork(id) {
  if (!hasFirebase) return localCall(`/api/works/${id}`, 'DELETE');
  const f = await getFirebase();
  const { fs, db } = f;
  const snap = await fs.getDoc(fs.doc(db, 'works', id));
  if (!snap.exists()) return; // 可能別的管理員剛刪掉了
  const work = snap.data();
  const batch = fs.writeBatch(db);
  batch.set(fs.doc(db, 'trash', id), { ...work, deletedBy: adminEmail(), deletedAt: fs.serverTimestamp() });
  batch.delete(fs.doc(db, 'works', id));
  addLog(batch, f, 'delete', id, work.name);
  await batch.commit();
}

/** 復原：從垃圾桶搬回作品清單（保留原本的上傳時間） */
export async function restoreWork(id) {
  if (!hasFirebase) return localCall(`/api/trash/${id}/restore`, 'POST');
  const f = await getFirebase();
  const { fs, db } = f;
  const snap = await fs.getDoc(fs.doc(db, 'trash', id));
  if (!snap.exists()) return;
  const { deletedBy, deletedAt, ...work } = snap.data(); // 拿掉垃圾桶專用的欄位
  const batch = fs.writeBatch(db);
  batch.set(fs.doc(db, 'works', id), work);
  batch.delete(fs.doc(db, 'trash', id));
  addLog(batch, f, 'restore', id, work.name);
  await batch.commit();
}

/** 永久刪除：從垃圾桶清掉，之後就救不回來了 */
export async function purgeWork(id) {
  if (!hasFirebase) return localCall(`/api/trash/${id}`, 'DELETE');
  const f = await getFirebase();
  const { fs, db } = f;
  const snap = await fs.getDoc(fs.doc(db, 'trash', id));
  if (!snap.exists()) return;
  const batch = fs.writeBatch(db);
  batch.delete(fs.doc(db, 'trash', id));
  addLog(batch, f, 'purge', id, snap.data().name);
  await batch.commit();
}

// Firestore 時間 → 毫秒（剛寫入時可能還是 null，先用現在時間代替）
const toMs = (t) => t?.toMillis?.() ?? Date.now();

/**
 * 訂閱垃圾桶和操作紀錄（只有管理員讀得到）
 * callback 收到 { trash, logs }，兩者都是「新 → 舊」
 * onError 收到錯誤（例如登入的帳號不是管理員）
 */
export function subscribeAdminData(callback, onError) {
  if (!hasFirebase) {
    const es = new EventSource('/api/admin-stream');
    es.onmessage = (e) => callback(JSON.parse(e.data));
    return () => es.close();
  }
  const state = { trash: [], logs: [] };
  const unsubs = [];
  let cancelled = false;
  getFirebase().then(({ fs, db }) => {
    if (cancelled) return;
    const trashQ = fs.query(fs.collection(db, 'trash'), fs.orderBy('deletedAt', 'desc'), fs.limit(SCREEN_LIMIT));
    unsubs.push(
      fs.onSnapshot(trashQ, (snap) => {
        state.trash = snap.docs.map((d) => {
          const { image, createdAt, deletedAt, ...rest } = d.data();
          return { id: d.id, ...rest, imageUrl: image, createdAt: toMs(createdAt), deletedAt: toMs(deletedAt) };
        });
        callback({ ...state });
      }, onError),
    );
    const logsQ = fs.query(fs.collection(db, 'logs'), fs.orderBy('at', 'desc'), fs.limit(SCREEN_LIMIT));
    unsubs.push(
      fs.onSnapshot(logsQ, (snap) => {
        state.logs = snap.docs.map((d) => ({ id: d.id, ...d.data(), at: toMs(d.data().at) }));
        callback({ ...state });
      }, onError),
    );
  });
  return () => { cancelled = true; unsubs.forEach((u) => u()); };
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
