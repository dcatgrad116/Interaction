// 管理頁：看所有作品、刪除不當內容
// Firebase 模式下要先用 Google 帳號登入；只有 firestore.rules 裡列的管理員信箱可以刪除
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import {
  subscribeWorks, deleteWork, backendName, hasFirebase,
  watchAdmin, adminSignIn, adminSignOut,
} from '../lib/store.js';
import { CHARACTERS } from '../data/characters.js';

const charName = (id) => CHARACTERS.find((c) => c.id === id)?.name ?? id;

// 把 Firebase 登入的錯誤代碼翻成看得懂的說明
const LOGIN_ERRORS = {
  'auth/configuration-not-found': 'Firebase 的 Authentication 還沒啟用：請到 Firebase 主控台 → Authentication → 開始使用，並開啟 Google 登入。',
  'auth/operation-not-allowed': 'Google 登入還沒開啟：請到 Firebase 主控台 → Authentication → 登入方式 → Google → 啟用。',
  'auth/unauthorized-domain': '這個網址不在允許登入的名單裡：請到 Authentication → 設定 → 授權網域，加入目前的網域。',
  'auth/popup-blocked': '登入視窗被瀏覽器擋掉了：請允許這個網站開啟彈出式視窗後再試一次。',
  'auth/popup-closed-by-user': '登入視窗被關掉了，請再按一次登入。',
  'auth/cancelled-popup-request': '登入視窗被關掉了，請再按一次登入。',
};
const loginError = (e) => LOGIN_ERRORS[e.code] ?? `登入失敗（${e.code || e.message}）`;

// 簡單的按鈕樣式
const btn = (bg) => ({ padding: '6px 14px', borderRadius: 8, background: bg, fontSize: 13 });

function Admin() {
  const [works, setWorks] = useState([]);
  const [user, setUser] = useState(undefined); // undefined＝確認中、null＝沒登入
  const [error, setError] = useState('');

  useEffect(() => subscribeWorks(setWorks), []);
  useEffect(() => watchAdmin(setUser), []);

  const remove = async (w) => {
    if (!confirm(`確定要刪除「${w.name}」的作品嗎？刪除後無法復原，大螢幕上也會立刻消失。`)) return;
    try {
      setError('');
      await deleteWork(w.id);
    } catch (e) {
      // 最常見的原因：登入的信箱不在 firestore.rules 的管理員名單裡
      setError(`刪除失敗：${e.code === 'permission-denied' ? '這個帳號沒有管理權限' : e.message}`);
    }
  };

  return (
    <div style={{ padding: 24, minHeight: '100%', background: '#2c3350' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 24, marginRight: 'auto' }}>作品管理（{works.length} 件）</h1>
        {hasFirebase && user && (
          <>
            <span style={{ fontSize: 13, opacity: 0.8 }}>{user.email}</span>
            <button style={btn('#4a5578')} onClick={adminSignOut}>登出</button>
          </>
        )}
        {hasFirebase && user === null && (
          <button
            style={btn('#548ca1')}
            onClick={() => {
              setError('');
              adminSignIn().catch((e) => setError(loginError(e)));
            }}
          >
            用 Google 登入
          </button>
        )}
      </div>
      <p style={{ opacity: 0.7, fontSize: 13, margin: '6px 0 20px' }}>
        資料來源：{backendName}｜新作品在最上面{hasFirebase && '｜顯示最新 200 件'}
      </p>
      {error && <p style={{ color: '#ffd5d5', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        {[...works].reverse().map((w) => (
          <div key={w.id} style={{ background: 'rgba(195,251,255,0.15)', borderRadius: 12, padding: 12 }}>
            <img src={w.imageUrl} alt="" style={{ width: '100%', height: 150, objectFit: 'contain' }} />
            <p style={{ fontWeight: 600, marginTop: 8 }}>{w.name}</p>
            <p style={{ fontSize: 13, opacity: 0.85, minHeight: 20 }}>{w.message || '（沒有留言）'}</p>
            <p style={{ fontSize: 11, opacity: 0.6 }}>
              {charName(w.character)}｜{new Date(w.createdAt).toLocaleTimeString('zh-TW')}
            </p>
            <button
              onClick={() => remove(w)}
              disabled={!user}
              title={user ? '' : '請先登入'}
              style={{ ...btn('#a84a5a'), marginTop: 8, width: '100%', opacity: user ? 1 : 0.4 }}
            >
              刪除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Admin />);
