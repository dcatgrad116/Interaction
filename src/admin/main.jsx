// 管理頁：看所有作品、刪除不當內容、從垃圾桶復原、查看操作紀錄
// Firebase 模式下要先用 Google 帳號登入；只有 firestore.rules 裡列的管理員信箱可以管理
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import {
  subscribeWorks, subscribeAdminData, deleteWork, restoreWork, purgeWork,
  backendName, hasFirebase, watchAdmin, adminSignIn, adminSignOut,
} from '../lib/store.js';
import { CHARACTERS } from '../data/characters.js';

const charName = (id) => CHARACTERS.find((c) => c.id === id)?.name ?? id;

// 時間顯示成「11/24 14:03」
const fmt = (ms) =>
  new Date(ms).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

// 操作紀錄的文字
const ACTION_TEXT = { delete: '刪除了', restore: '復原了', purge: '永久刪除了' };
const ACTION_COLOR = { delete: '#e0a3ad', restore: '#a3e0c0', purge: '#ff8a8a' };

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
// 管理動作失敗的說明（最常見：登入的信箱不在 firestore.rules 的管理員名單裡）
const actionError = (label, e) =>
  `${label}失敗：${e.code === 'permission-denied' ? '這個帳號沒有管理權限' : e.message}`;

// 簡單的按鈕、卡片樣式
const btn = (bg) => ({ padding: '6px 14px', borderRadius: 8, background: bg, fontSize: 13 });
const card = { background: 'rgba(195,251,255,0.15)', borderRadius: 12, padding: 12 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 };

// 一件作品的縮圖＋文字（作品分頁和垃圾桶共用）
function WorkInfo({ w }) {
  return (
    <>
      <img src={w.imageUrl} alt="" style={{ width: '100%', height: 150, objectFit: 'contain' }} />
      <p style={{ fontWeight: 600, marginTop: 8 }}>{w.name}</p>
      <p style={{ fontSize: 13, opacity: 0.85, minHeight: 20 }}>{w.message || '（沒有留言）'}</p>
      <p style={{ fontSize: 11, opacity: 0.6 }}>{charName(w.character)}｜上傳 {fmt(w.createdAt)}</p>
    </>
  );
}

function Admin() {
  const [tab, setTab] = useState('works'); // 'works' 作品｜'trash' 垃圾桶｜'logs' 歷史紀錄
  const [works, setWorks] = useState([]);
  const [adminData, setAdminData] = useState({ trash: [], logs: [] });
  const [user, setUser] = useState(undefined); // undefined＝確認中、null＝沒登入
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null); // 正在處理的作品（避免連按兩次）

  useEffect(() => subscribeWorks(setWorks), []);
  useEffect(() => watchAdmin(setUser), []);
  // 垃圾桶和紀錄只有管理員讀得到，所以登入後才開始抓
  useEffect(() => {
    if (!user) return setAdminData({ trash: [], logs: [] });
    return subscribeAdminData(setAdminData, (e) => setError(actionError('讀取垃圾桶和紀錄', e)));
  }, [user]);

  // 執行管理動作：先確認 → 執行 → 失敗就顯示原因
  const run = async (w, { ask, label, action }) => {
    if (ask && !confirm(ask)) return;
    setBusyId(w.id);
    setError('');
    try {
      await action(w.id);
    } catch (e) {
      setError(actionError(label, e));
    }
    setBusyId(null);
  };
  const remove = (w) =>
    run(w, {
      ask: `確定要刪除「${w.name}」的作品嗎？\n作品會移到垃圾桶，大螢幕上會立刻消失，之後還可以復原。`,
      label: '刪除',
      action: deleteWork,
    });
  const restore = (w) => run(w, { label: '復原', action: restoreWork });
  const purge = (w) =>
    run(w, {
      ask: `確定要永久刪除「${w.name}」的作品嗎？\n永久刪除後就無法復原了。`,
      label: '永久刪除',
      action: purgeWork,
    });

  const canManage = !!user;
  const tabs = [
    ['works', `作品（${works.length}）`],
    ['trash', `垃圾桶（${adminData.trash.length}）`],
    ['logs', '歷史紀錄'],
  ];

  return (
    <div style={{ padding: 24, minHeight: '100%', background: '#2c3350' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 24, marginRight: 'auto' }}>作品管理</h1>
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
      <p style={{ opacity: 0.7, fontSize: 13, margin: '6px 0 16px' }}>
        資料來源：{backendName}｜新的在最上面{hasFirebase && '｜各顯示最新 200 筆'}
      </p>

      {/* 分頁切換 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              ...btn(tab === key ? '#548ca1' : 'rgba(255,255,255,0.08)'),
              border: '1.5px solid ' + (tab === key ? '#bedee1' : 'transparent'),
              fontWeight: tab === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#ffd5d5', marginBottom: 16 }}>{error}</p>}
      {tab !== 'works' && !canManage && (
        <p style={{ opacity: 0.8 }}>垃圾桶和歷史紀錄只有管理員看得到，請先登入。</p>
      )}

      {/* 作品 */}
      {tab === 'works' && (
        <div style={grid}>
          {[...works].reverse().map((w) => (
            <div key={w.id} style={card}>
              <WorkInfo w={w} />
              <button
                onClick={() => remove(w)}
                disabled={!canManage || busyId === w.id}
                title={canManage ? '' : '請先登入'}
                style={{ ...btn('#a84a5a'), marginTop: 8, width: '100%', opacity: canManage ? 1 : 0.4 }}
              >
                刪除
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 垃圾桶 */}
      {tab === 'trash' && canManage && (
        adminData.trash.length === 0 ? (
          <p style={{ opacity: 0.7 }}>垃圾桶是空的。</p>
        ) : (
          <div style={grid}>
            {adminData.trash.map((w) => (
              <div key={w.id} style={card}>
                <WorkInfo w={w} />
                <p style={{ fontSize: 11, color: '#e0a3ad', marginTop: 4 }}>
                  由 {w.deletedBy} 在 {fmt(w.deletedAt)} 刪除
                </p>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    onClick={() => restore(w)}
                    disabled={busyId === w.id}
                    style={{ ...btn('#3f8a6c'), flex: 1 }}
                  >
                    復原
                  </button>
                  <button
                    onClick={() => purge(w)}
                    disabled={busyId === w.id}
                    style={{ ...btn('#7a2f3b'), flex: 1 }}
                  >
                    永久刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 歷史紀錄 */}
      {tab === 'logs' && canManage && (
        adminData.logs.length === 0 ? (
          <p style={{ opacity: 0.7 }}>還沒有任何紀錄。</p>
        ) : (
          <ul style={{ listStyle: 'none', maxWidth: 720 }}>
            {adminData.logs.map((log) => (
              <li
                key={log.id}
                style={{ display: 'flex', gap: 14, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 14 }}
              >
                <span style={{ opacity: 0.6, flex: '0 0 92px', fontVariantNumeric: 'tabular-nums' }}>{fmt(log.at)}</span>
                <span>
                  {log.by}{' '}
                  <b style={{ color: ACTION_COLOR[log.action] }}>{ACTION_TEXT[log.action] ?? log.action}</b>{' '}
                  「{log.workName}」的作品
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Admin />);
