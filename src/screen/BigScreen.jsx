// 展場大螢幕：作品隨意飄、互相碰撞反彈（DVD 待機畫面），輪流放大並顯示留言
//
// 網址參數（可在展場現場微調，不用改程式）：
//   ?max=12     畫面上最多同時幾個作品
//   ?speed=60   飄動速度（像素／秒，以 1440 寬為基準）
//   ?spot=7     每幾秒換下一個放大的作品
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { subscribeWorks } from '../lib/store.js';
import { CHARACTERS } from '../data/characters.js';

const params = new URLSearchParams(location.search);
const MAX = Number(params.get('max')) || 12;
const SPEED = Number(params.get('speed')) || 60;
const SPOT_MS = (Number(params.get('spot')) || 7) * 1000;
const ROTATE_MS = 12000; // 作品比格子多時，每隔多久換一個作品上場
const NEW_GAP_MS = 2500; // 一次湧入很多新作品時，每隔多久放一個進場
const DESIGN_W = 1440; // 設計稿寬度
const SPRITE_W = 165; // 一般作品寬度（設計稿基準）
const SPOT_SCALE = 1.9; // 放大倍率
const MASCOT_COUNT = 5; // 作品不夠時，用吉祥物補位，畫面才不會空
const TAG_S = 0.7; // 左上角標語和星星線的大小（設計稿的 70%）

const rand = (a, b) => a + Math.random() * (b - a);

export default function BigScreen() {
  const spritesRef = useRef([]); // 畫面上的每個飄浮物（用 ref 存，動畫不必每格重繪 React）
  const worksRef = useRef([]); // 最新的作品清單
  const knownRef = useRef(null); // 已經看過的作品 id（用來判斷誰是新來的）
  const queueRef = useRef([]); // 新作品排隊進場（先丟先顯示）
  const spotRef = useRef(null); // 目前放大中的飄浮物 key
  const timersRef = useRef({ lastRotate: 0, lastNew: 0, lastSpot: 0 });
  const headRef = useRef(null); // 標題區（作品要避開）
  const [, rerender] = useReducer((x) => x + 1, 0);
  const [caption, setCaption] = useState(null); // 底部字幕條的內容
  const [scale, setScale] = useState(window.innerWidth / DESIGN_W);

  // 視窗大小改變時，重新計算縮放比例
  useEffect(() => {
    const onResize = () => setScale(window.innerWidth / DESIGN_W);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---------- 飄浮物的新增與移除 ----------
  const makeSprite = (work, mascot) => {
    const angle = rand(0, Math.PI * 2);
    return {
      key: work ? work.id : 'mascot-' + mascot.id,
      work, // 參與者的作品（吉祥物則為 null）
      src: work ? work.imageUrl : mascot.img,
      x: rand(0.15, 0.85) * window.innerWidth,
      y: rand(0.3, 0.8) * window.innerHeight,
      vx: Math.cos(angle),
      vy: Math.sin(angle),
      ratio: 1, // 圖片高寬比，圖片載入後更新
      scale: 0.01, // 從很小長出來
      target: 1,
      mirrorLeft: Math.random() < 0.5, // 🪞 放左邊或右邊
      wobble: rand(0, Math.PI * 2), // 輕微搖擺的起始相位
      shownAt: performance.now(),
      lastSpot: 0,
      leaving: false,
      el: null,
    };
  };

  const liveSprites = () => spritesRef.current.filter((s) => !s.leaving);

  const removeSprite = (s) => {
    if (s.leaving) return;
    s.leaving = true;
    s.target = 0.01; // 縮小消失
    if (spotRef.current === s.key) endSpot();
    setTimeout(() => {
      spritesRef.current = spritesRef.current.filter((x) => x !== s);
      rerender();
    }, 700);
  };

  const addSprite = (work, mascot) => {
    const s = makeSprite(work, mascot);
    spritesRef.current.push(s);
    rerender();
    return s;
  };

  // 讓一個作品上場：有吉祥物先換掉吉祥物；格子滿了就換掉待最久的作品
  const bringIn = (work) => {
    const live = liveSprites();
    if (live.some((s) => s.key === work.id)) return null;
    const mascot = live.find((s) => !s.work);
    if (mascot) removeSprite(mascot);
    else if (live.length >= MAX) {
      const candidates = live.filter((s) => s.key !== spotRef.current);
      const oldest = candidates.sort((a, b) => a.shownAt - b.shownAt)[0];
      if (oldest) removeSprite(oldest);
    }
    return addSprite(work);
  };

  // ---------- 放大＋字幕 ----------
  function endSpot() {
    const cur = spritesRef.current.find((s) => s.key === spotRef.current);
    if (cur) cur.target = 1;
    spotRef.current = null;
    setCaption(null);
  }
  const startSpot = (s) => {
    endSpot();
    if (!s) return;
    s.target = SPOT_SCALE;
    s.lastSpot = performance.now();
    spotRef.current = s.key;
    setCaption(s.work);
    timersRef.current.lastSpot = performance.now();
  };
  // 挑下一個要放大的：優先挑有留言、而且最久沒被放大的作品
  const pickSpot = () => {
    const works = liveSprites().filter((s) => s.work && s.key !== spotRef.current);
    if (!works.length) return null;
    const withMsg = works.filter((s) => s.work.message);
    const pool = withMsg.length ? withMsg : works;
    return pool.sort((a, b) => a.lastSpot - b.lastSpot)[0];
  };

  // ---------- 接收作品清單 ----------
  useEffect(() => {
    // 一開始先放吉祥物
    CHARACTERS.slice(0, MASCOT_COUNT).forEach((m) => addSprite(null, m));

    return subscribeWorks((works) => {
      worksRef.current = works;
      const ids = new Set(works.map((w) => w.id));

      if (knownRef.current === null) {
        // 第一次載入：已存在的作品隨機挑一批上場（不算新作品）
        knownRef.current = ids;
        const pick = [...works].sort(() => Math.random() - 0.5).slice(0, MAX);
        pick.forEach((w) => bringIn(w));
        return;
      }

      // 新來的作品 → 排隊（依上傳時間，先丟先顯示）
      works.forEach((w) => {
        if (!knownRef.current.has(w.id)) queueRef.current.push(w);
      });
      knownRef.current = ids;

      // 被管理員刪除的作品 → 立刻下場
      queueRef.current = queueRef.current.filter((w) => ids.has(w.id));
      liveSprites().forEach((s) => {
        if (s.work && !ids.has(s.work.id)) removeSprite(s);
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 動畫主迴圈 ----------
  useEffect(() => {
    let raf;
    let last = performance.now();

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); // 秒；切換分頁回來時避免瞬移
      last = now;
      const t = timersRef.current;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const k = W / DESIGN_W;
      const sprites = spritesRef.current;

      // 1) 排程：新作品進場、輪播、換放大對象
      if (queueRef.current.length && now - t.lastNew > NEW_GAP_MS) {
        const s = bringIn(queueRef.current.shift());
        t.lastNew = now;
        if (s) startSpot(s); // 新作品一進場就放大，讓剛送出的人馬上看到
      } else if (now - t.lastRotate > ROTATE_MS) {
        t.lastRotate = now;
        const showing = new Set(liveSprites().map((s) => s.key));
        const offstage = worksRef.current.filter((w) => !showing.has(w.id));
        if (offstage.length) bringIn(offstage[Math.floor(Math.random() * offstage.length)]);
      }
      if (now - t.lastSpot > SPOT_MS) {
        t.lastSpot = now;
        startSpot(pickSpot());
      }

      // 2) 移動＋撞牆反彈
      for (const s of sprites) {
        s.scale += (s.target - s.scale) * Math.min(1, dt * 4); // 平滑放大縮小
        const w = SPRITE_W * k * s.scale;
        s.r = (w * Math.max(1, s.ratio)) / 2 * 0.82; // 碰撞半徑（略小於圖片，看起來更自然）
        const spd = SPEED * k * (s.key === spotRef.current ? 0.35 : 1); // 放大中的走慢一點
        s.x += s.vx * spd * dt;
        s.y += s.vy * spd * dt;
        if (s.x < s.r) { s.x = s.r; s.vx = Math.abs(s.vx); }
        if (s.x > W - s.r) { s.x = W - s.r; s.vx = -Math.abs(s.vx); }
        if (s.y < s.r) { s.y = s.r; s.vy = Math.abs(s.vy); }
        if (s.y > H - s.r) { s.y = H - s.r; s.vy = -Math.abs(s.vy); }

        // 左上角標題區也當成牆壁：作品碰到就彈開，不會蓋住標題
        const hb = headRef.current?.getBoundingClientRect();
        if (hb) {
          const pad = 16 * k;
          const L = hb.left - pad, R = hb.right + pad, T = hb.top - pad, B = hb.bottom + pad;
          let nx = 0, ny = 0, push = 0;
          if (s.x > L && s.x < R && s.y > T && s.y < B) {
            // 作品中心已經在框內：往最近的那一邊（右或下）推出去
            const toRight = R - s.x;
            const toBottom = B - s.y;
            if (toRight < toBottom) { nx = 1; push = toRight + s.r; } else { ny = 1; push = toBottom + s.r; }
          } else {
            // 作品中心在框外：看框上離中心最近的點有沒有碰到作品
            const cx = Math.max(L, Math.min(s.x, R));
            const cy = Math.max(T, Math.min(s.y, B));
            const d = Math.hypot(s.x - cx, s.y - cy);
            if (d < s.r) { nx = (s.x - cx) / d; ny = (s.y - cy) / d; push = s.r - d; }
          }
          if (push > 0) {
            s.x += nx * push;
            s.y += ny * push;
            const dot = s.vx * nx + s.vy * ny;
            if (dot < 0) { s.vx -= 2 * dot * nx; s.vy -= 2 * dot * ny; } // 鏡面反彈
          }
        }
      }

      // 3) 互相碰撞：把重疊的推開，並交換碰撞方向上的速度（彈性碰撞）
      for (let i = 0; i < sprites.length; i++) {
        for (let j = i + 1; j < sprites.length; j++) {
          const a = sprites[i];
          const b = sprites[j];
          if (a.leaving || b.leaving) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const overlap = a.r + b.r - dist;
          if (overlap <= 0) continue;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= (nx * overlap) / 2; a.y -= (ny * overlap) / 2;
          b.x += (nx * overlap) / 2; b.y += (ny * overlap) / 2;
          const va = a.vx * nx + a.vy * ny;
          const vb = b.vx * nx + b.vy * ny;
          if (va - vb > 0) {
            a.vx += (vb - va) * nx; a.vy += (vb - va) * ny;
            b.vx += (va - vb) * nx; b.vy += (va - vb) * ny;
          }
        }
      }

      // 4) 速度方向正規化（像 DVD 一樣永遠等速，不會越撞越慢）並更新畫面
      for (const s of sprites) {
        const len = Math.hypot(s.vx, s.vy) || 1;
        s.vx /= len; s.vy /= len;
        if (!s.el) continue;
        const rot = Math.sin(now / 1400 + s.wobble) * 5; // 輕微搖擺
        s.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${s.scale}) rotate(${rot}deg)`;
        s.el.style.zIndex = s.key === spotRef.current ? 50 : 1;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 點畫面任一處 → 全螢幕（展場用）
  const fullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {});

  const px = (n) => `${n * scale}px`; // 設計稿數值 → 實際像素

  return (
    <div className="screen" onClick={fullscreen}>
      {/* 標題區 */}
      <header ref={headRef} className="screen__head" style={{ left: px(64), top: px(74) }}>
        <img src="/assets/logo.webp" alt="鏡行式" style={{ width: px(198) }} />
        {/* 標語和星星線：比設計稿縮小 30%（× TAG_S），並往上靠近 logo */}
        <h1 style={{ fontSize: px(36 * TAG_S), marginTop: px(16) }}>與展覽小夥伴一起，留下今天的好心情！</h1>
        <div
          className="screen__starline"
          style={{ width: px(643 * TAG_S), height: px(14 * TAG_S), marginTop: px(24 * TAG_S) }}
        >
          <img src="/assets/starline.webp" alt="" style={{ width: px(508 * TAG_S) }} />
          <img src="/assets/starline.webp" alt="" style={{ width: px(508 * TAG_S), left: px(322 * TAG_S) }} />
        </div>
      </header>

      {/* 飄浮的作品 */}
      {spritesRef.current.map((s) => (
        <div key={s.key} className="sprite" ref={(el) => (s.el = el)} style={{ width: px(SPRITE_W) }}>
          <span
            className="sprite__mirror"
            style={{ fontSize: px(96), [s.mirrorLeft ? 'left' : 'right']: px(-38) }}
          >
            🪞
          </span>
          <img
            src={s.src}
            alt=""
            onLoad={(e) => (s.ratio = e.target.naturalHeight / e.target.naturalWidth)}
          />
        </div>
      ))}

      {/* 底部字幕條：放大中作品的縮圖＋暱稱＋留言 */}
      {caption && (
        <div key={caption.id} className="caption" style={{ bottom: px(83), height: px(92) }}>
          <img className="caption__thumb" src={caption.imageUrl} alt="" style={{ height: px(122), left: px(-62) }} />
          <div className="caption__bar" style={{ paddingLeft: px(110), paddingRight: px(40), gap: px(22), borderRadius: px(15) }}>
            <span className="caption__name" style={{ fontSize: px(24) }}>{caption.name}</span>
            {caption.message && (
              <span className="caption__msg" style={{ fontSize: px(36) }}>{caption.message}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
