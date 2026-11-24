// STEP 2：裝飾你的展覽小夥伴
// 畫布用 react-konva：每個元素（小夥伴／照片／emoji）都能拖拉、旋轉、縮放
// 也保留設計稿的按鈕操作（放大縮小、上下左右、圖層順序），不熟手勢的人也能用
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KImage, Text, Transformer } from 'react-konva';
import StepHead from '../components/StepHead.jsx';
import { QUICK_EMOJIS, MORE_EMOJIS } from '../../data/characters.js';
import { removeBg, shrinkImage, preloadRemoveBg } from '../../lib/removeBg.js';

// 畫布的「設計尺寸」：跟 Figma 一樣 314×339，實際顯示時依螢幕寬度等比縮放
const W = 314;
const H = 339;
const STEP_MOVE = 10; // 上下左右按一次移動的距離
const STEP_ZOOM = 1.12; // 放大縮小按一次的倍率
const HISTORY_MAX = 30; // 復原最多記幾步（太多會吃手機記憶體）
const newId = () => Math.random().toString(36).slice(2, 9);
const jitter = (n) => (Math.random() - 0.5) * n; // 新元素位置稍微錯開，才不會全部疊在正中間

const EMOJI_INPUT_MAX = 5; // 鍵盤輸入一次最多加幾個 emoji

// 從使用者輸入的文字裡挑出 emoji（中英文、數字、空白都會被丟掉）
// 用「字素」切開，像 👨‍👩‍👧、👍🏽、🇹🇼 這種由好幾個字碼組成的 emoji 才會被當成一個
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
function pickEmojis(text) {
  const parts =
    typeof Intl !== 'undefined' && Intl.Segmenter
      ? [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].map((s) => s.segment)
      : Array.from(text); // 很舊的瀏覽器不支援 Segmenter，就一個字一個字切
  return parts.filter((p) => EMOJI_RE.test(p));
}

// 復原的彎箭頭圖示；flip＝左右翻轉，變成重做
function UndoIcon({ flip = false }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" style={flip ? { transform: 'scaleX(-1)' } : undefined} aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

// 讀取圖片給 Konva 用
function useLoadedImage(src) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    if (!src) return;
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  return img;
}

// 畫布上的單一元素
function CanvasItem({ item, onSelect, onChange, onMove, onReady }) {
  const img = useLoadedImage(item.type === 'emoji' ? null : item.src);
  // 圖片載入完成 → 通知外層重畫，選取框才能套到這張圖上
  useEffect(() => {
    if (img) onReady();
  }, [img]); // eslint-disable-line react-hooks/exhaustive-deps
  const common = {
    id: item.id,
    name: 'item',
    x: item.x,
    y: item.y,
    scaleX: item.scale,
    scaleY: item.scale,
    rotation: item.rotation,
    draggable: true,
    onMouseDown: onSelect,
    onTouchStart: onSelect,
    onDragMove: onMove,
    onTransform: onMove,
    onDragEnd: (e) => onChange({ x: e.target.x(), y: e.target.y() }),
    onTransformEnd: (e) => {
      const n = e.target;
      onChange({ x: n.x(), y: n.y(), scale: n.scaleX(), rotation: n.rotation() });
    },
  };

  if (item.type === 'emoji') {
    // emoji 用文字畫，以中心點為基準旋轉
    return (
      <Text
        {...common}
        text={item.text}
        fontSize={48}
        width={64}
        height={64}
        align="center"
        verticalAlign="middle"
        offsetX={32}
        offsetY={32}
      />
    );
  }
  if (!img) return null;
  const w = item.w;
  const h = (w * img.height) / img.width;
  // 小夥伴加上設計稿的投影
  const shadow =
    item.type === 'char'
      ? { shadowColor: 'rgba(54,63,89,0.75)', shadowBlur: 5.3, shadowOffsetY: 4 }
      : {};
  return <KImage {...common} {...shadow} image={img} width={w} height={h} offsetX={w / 2} offsetY={h / 2} />;
}

export default function Decorate({ character, items, setItems, onBack, onNext }) {
  const boxRef = useRef(null); // 畫布外框（用來量寬度）
  const stageRef = useRef(null);
  const contentRef = useRef(null); // 放元素的圖層
  const trRef = useRef(null); // 選取框（可旋轉縮放）
  const fileRef = useRef(null);

  const [width, setWidth] = useState(314); // 畫布實際寬度（px）
  const [selectedId, setSelectedId] = useState(null);
  const [delPos, setDelPos] = useState(null); // 刪除鈕位置
  const [busy, setBusy] = useState(null); // 去背中的狀態 { progress }
  const [notice, setNotice] = useState('');
  const [sheet, setSheet] = useState(null); // 'emoji' | 'edit' | null
  const [replaceId, setReplaceId] = useState(null); // 「換一張照片」時要替換的元素
  const [emojiText, setEmojiText] = useState(''); // 鍵盤輸入框的內容
  const [emojiHint, setEmojiHint] = useState(''); // 鍵盤輸入的提示訊息
  const [, setReadyTick] = useState(0); // 圖片載入完成時觸發重畫用

  const k = width / W; // 縮放倍率：設計尺寸 → 實際像素
  const selected = items.find((i) => i.id === selectedId);
  const photos = items.filter((i) => i.type === 'photo');

  // 第一次進來：把選好的小夥伴放在畫布正中間
  useEffect(() => {
    preloadRemoveBg();
    if (!items.some((i) => i.type === 'char')) {
      setItems((list) => [
        { id: 'char', type: 'char', src: character.img, x: W / 2, y: H / 2, w: 199, scale: 1, rotation: 0 },
        ...list,
      ]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 依外框寬度調整畫布大小（不同手機寬度都能用）
  useLayoutEffect(() => {
    const el = boxRef.current;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 選取框跟著選中的元素；同時更新刪除鈕位置
  const updateDelPos = () => {
    const node = selectedId && stageRef.current?.findOne('#' + selectedId);
    if (!node || selected?.type === 'char') return setDelPos((p) => (p ? null : p)); // 小夥伴本人不能刪
    const r = node.getClientRect();
    const next = { left: Math.round(r.x + r.width - 12), top: Math.round(r.y - 12) };
    // 位置有變才更新，避免無限重繪
    setDelPos((p) => (p && p.left === next.left && p.top === next.top ? p : next));
  };
  useEffect(() => {
    const node = selectedId && stageRef.current?.findOne('#' + selectedId);
    trRef.current?.nodes(node ? [node] : []);
    trRef.current?.getLayer()?.batchDraw();
    updateDelPos();
  }); // 每次重畫都同步一次（圖片載入完成後節點才會出現）

  // ---------- 復原／重做 ----------
  // 原理像一疊便利貼：每做一個動作，就把「動作前的畫面」貼到「過去」那疊；
  // 按復原 → 從「過去」拿最上面一張回來，目前的畫面改貼到「未來」那疊；按重做則反過來
  const itemsRef = useRef(items); // 永遠指向最新的畫面內容
  itemsRef.current = items;
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const [, setHistTick] = useState(0); // 紀錄變動時讓按鈕重新判斷能不能按
  const syncHist = () => setHistTick((n) => n + 1);

  // 所有「使用者的編輯動作」都經過這裡，才會被記成一步
  const commit = (update) => {
    const prev = itemsRef.current;
    const next = update(prev);
    if (next === prev) return; // 沒有改變就不記
    pastRef.current = [...pastRef.current, prev].slice(-HISTORY_MAX);
    futureRef.current = []; // 做了新動作，原本可以重做的就清掉
    itemsRef.current = next; // 立刻更新，連續快速操作時才不會拿到舊畫面
    setItems(next);
    syncHist();
  };
  const undo = () => {
    const prev = pastRef.current.at(-1);
    if (!prev) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, itemsRef.current];
    itemsRef.current = prev;
    setItems(prev);
    syncHist();
  };
  const redo = () => {
    const next = futureRef.current.at(-1);
    if (!next) return;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, itemsRef.current];
    itemsRef.current = next;
    setItems(next);
    syncHist();
  };
  const canUndo = pastRef.current.length > 0 && !busy;
  const canRedo = futureRef.current.length > 0 && !busy;

  // ---------- 修改元素 ----------
  const patch = (id, changes) => commit((list) => list.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  const add = (item) => {
    commit((list) => [...list, item]);
    setSelectedId(item.id);
  };
  const remove = (id) => {
    commit((list) => list.filter((i) => i.id !== id));
    setSelectedId(null);
  };

  // 放大縮小、移動
  const zoom = (f) => selected && patch(selected.id, { scale: Math.min(5, Math.max(0.2, selected.scale * f)) });
  const move = (dx, dy) => selected && patch(selected.id, { x: selected.x + dx, y: selected.y + dy });

  // 圖層順序：陣列越後面＝越上層
  const reorder = (mode) => {
    if (!selected) return;
    commit((list) => {
      const arr = [...list];
      const i = arr.findIndex((x) => x.id === selected.id);
      const [it] = arr.splice(i, 1);
      const to = { up: Math.min(arr.length, i + 1), down: Math.max(0, i - 1), top: arr.length, bottom: 0 }[mode];
      if (to === i) return list; // 已經在最上／最下層，不算一步
      arr.splice(to, 0, it);
      return arr;
    });
  };

  // ---------- emoji ----------
  const addEmoji = (text) => {
    add({ id: newId(), type: 'emoji', text, x: W / 2 + jitter(160), y: H / 2 + jitter(160), scale: 1, rotation: 0 });
    setSheet(null);
  };

  // 開關「更多 emoji」面板；打開時清空上次的輸入
  const openEmojiSheet = () => {
    setEmojiText('');
    setEmojiHint('');
    setSheet('emoji');
  };

  // 鍵盤輸入的 emoji：一次可以好幾個，但整批只算「一步」，按一次復原就全部收回
  const addTypedEmojis = (e) => {
    e.preventDefault(); // 不要讓表單重新整理頁面
    const found = pickEmojis(emojiText);
    if (!found.length) {
      setEmojiHint(emojiText.trim() ? '只能加入 emoji 喔，試試切換到 😀 鍵盤' : '先輸入一個 emoji');
      return;
    }
    const list = found.slice(0, EMOJI_INPUT_MAX).map((text) => ({
      id: newId(), type: 'emoji', text, x: W / 2 + jitter(160), y: H / 2 + jitter(160), scale: 1, rotation: 0,
    }));
    commit((items) => [...items, ...list]);
    setSelectedId(list[list.length - 1].id);
    setSheet(null);
  };

  // ---------- 照片：選圖 → 自動去背 ----------
  const pickPhoto = (replace = null) => {
    setReplaceId(replace);
    fileRef.current.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 清空，讓同一張圖也能再選一次
    if (!file) return;
    setSheet(null);
    setNotice('');
    setBusy({ progress: 0 });
    const original = URL.createObjectURL(await shrinkImage(file, 1024));
    let cut = null;
    try {
      const blob = await removeBg(file, (p) => setBusy({ progress: p }));
      cut = URL.createObjectURL(blob);
    } catch (err) {
      console.error('去背失敗', err);
      setNotice('去背沒有成功，先放原圖；可以按「編輯」再試一次');
    }
    setBusy(null);
    const photo = { original, cut, src: cut || original };
    if (replaceId) {
      patch(replaceId, photo);
      setSelectedId(replaceId);
    } else {
      add({ id: newId(), type: 'photo', ...photo, x: W / 2 + jitter(120), y: H / 2 + jitter(120), w: 130, scale: 1, rotation: 0 });
    }
  };

  // 對已經放上去的照片重新去背
  const retryCut = async (photo) => {
    setSheet(null);
    setNotice('');
    setBusy({ progress: 0 });
    try {
      const blob = await removeBg(await (await fetch(photo.original)).blob(), (p) => setBusy({ progress: p }));
      const cut = URL.createObjectURL(blob);
      patch(photo.id, { cut, src: cut });
    } catch {
      setNotice('還是沒辦法去背，可能這張照片主體不明顯，換一張試試？');
    }
    setBusy(null);
  };

  // 「編輯」要處理的照片：優先用選中的照片，沒選就用最後一張
  const editTarget = selected?.type === 'photo' ? selected : photos[photos.length - 1];

  // ---------- 下一步：輸出透明 PNG ----------
  const exportPng = () => {
    trRef.current.nodes([]); // 先拿掉選取框，不要被拍進去
    const layer = contentRef.current;
    const r = layer.getClientRect(); // 所有元素的外框（只輸出有內容的範圍）
    const pad = 8 * k; // 留一點邊，投影才不會被切掉
    const box = { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
    const pixelRatio = Math.min(4, 900 / Math.max(box.width, box.height)); // 長邊約 900px
    const png = stageRef.current.toDataURL({ ...box, pixelRatio, mimeType: 'image/png' });
    setSelectedId(null);
    onNext(png);
  };

  // 點畫布空白處：取消選取
  const onStageDown = (e) => {
    if (e.target === e.target.getStage()) setSelectedId(null);
  };

  const noSel = !selected;
  const loadingText =
    busy && busy.progress > 0 && busy.progress < 100
      ? `第一次使用，下載去背工具中 ${busy.progress}%`
      : '正在幫你去背，大約 10～30 秒⋯';

  return (
    <main className="page">
      <StepHead no={2} title="裝飾你的展覽小夥伴" />
      <p className="lead">
        留下一部分的你！可以是今天的穿搭配件、喜歡的 emoji、特別的小物等任何能夠代表你或與小夥伴有共鳴的事物。
      </p>

      {/* 畫布 */}
      <div ref={boxRef} className="glass canvas-card">
        <Stage
          ref={stageRef}
          width={width}
          height={width * (H / W)}
          scaleX={k}
          scaleY={k}
          onMouseDown={onStageDown}
          onTouchStart={onStageDown}
        >
          <Layer ref={contentRef}>
            {items.map((it) => (
              <CanvasItem
                key={it.id}
                item={it}
                onSelect={() => setSelectedId(it.id)}
                onChange={(c) => patch(it.id, c)}
                onMove={updateDelPos}
                onReady={() => setReadyTick((n) => n + 1)}
              />
            ))}
          </Layer>
          <Layer>
            <Transformer
              ref={trRef}
              keepRatio
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              anchorSize={14}
              anchorCornerRadius={7}
              anchorStroke="#548ca1"
              borderStroke="#ffffff"
              borderDash={[4, 4]}
              rotateAnchorOffset={24}
              boundBoxFunc={(oldB, newB) => (newB.width < 20 ? oldB : newB)}
            />
          </Layer>
        </Stage>

        {/* 復原／重做（畫布左上角） */}
        <div className="history-btns">
          <button className="history-btn" aria-label="復原" title="復原" disabled={!canUndo} onClick={undo}>
            <UndoIcon />
          </button>
          <button className="history-btn" aria-label="重做" title="重做" disabled={!canRedo} onClick={redo}>
            <UndoIcon flip />
          </button>
        </div>

        {/* 刪除選中的元素 */}
        {delPos && (
          <button
            aria-label="刪除"
            onClick={() => remove(selectedId)}
            style={{
              position: 'absolute', zIndex: 4, left: delPos.left, top: delPos.top, width: 24, height: 24,
              borderRadius: '50%', background: '#363f59', border: '1.5px solid #bedee1', fontSize: 12, lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}

        {noSel && !busy && <p className="canvas-hint">點一下元素就能拖曳、旋轉、縮放</p>}

        {busy && (
          <div className="busy">
            <div className="spinner" />
            <p>{loadingText}</p>
          </div>
        )}
      </div>
      {notice && <p className="error" style={{ marginTop: 10 }}>{notice}</p>}

      {/* 01 照片 */}
      <section className="tool-group">
        <p className="tool-group__label"><b>01</b>｜加入一張相片，進入編輯可簡單去背</p>
        <div className="photo-row">
          <button className="btn-outline" onClick={() => pickPhoto()} disabled={!!busy}>+ 從相簿中選擇圖片</button>
          <button className="btn-solid" onClick={() => setSheet('edit')} disabled={!editTarget || !!busy}>編輯</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </section>

      {/* 02 emoji */}
      <section className="tool-group">
        <p className="tool-group__label"><b>02</b>｜加入 emoji</p>
        <div className="emoji-row">
          {QUICK_EMOJIS.map((e) => (
            <button key={e} className="emoji-btn" onClick={() => addEmoji(e)}>{e}</button>
          ))}
          <button className="emoji-btn emoji-btn--more" aria-label="更多 emoji" onClick={openEmojiSheet}>
            <img src="/assets/icon-more-horiz.svg" width="24" height="24" alt="" />
          </button>
        </div>
      </section>

      {/* 03 調整位置 */}
      <section className="tool-group">
        <p className="tool-group__label"><b>03</b>｜點選元素調整位置</p>
        <div className="ctrl-row">
          <button className="ctrl" disabled={noSel} onClick={() => zoom(STEP_ZOOM)}>放大 +</button>
          <button className="ctrl" disabled={noSel} onClick={() => zoom(1 / STEP_ZOOM)}>縮小 －</button>
          <button className="ctrl" disabled={noSel} onClick={() => move(-STEP_MOVE, 0)}>左 ←</button>
          <button className="ctrl" disabled={noSel} onClick={() => move(STEP_MOVE, 0)}>右 →</button>
          <button className="ctrl" disabled={noSel} onClick={() => move(0, -STEP_MOVE)}>上 ↑</button>
          <button className="ctrl" disabled={noSel} onClick={() => move(0, STEP_MOVE)}>下 ↓</button>
        </div>
        <div className="ctrl-row">
          <button className="ctrl" disabled={noSel} onClick={() => reorder('up')}>圖層上移</button>
          <button className="ctrl" disabled={noSel} onClick={() => reorder('down')}>圖層下移</button>
          <button className="ctrl" disabled={noSel} onClick={() => reorder('top')}>移至最前</button>
          <button className="ctrl" disabled={noSel} onClick={() => reorder('bottom')}>移至最後</button>
        </div>
      </section>

      <div className="pill-row" style={{ gap: 7 }}>
        <button className="pill" onClick={onBack}>上一步</button>
        <button className="pill" onClick={exportPng} disabled={!!busy}>下一步</button>
      </div>

      {/* 更多 emoji 面板 */}
      {sheet === 'emoji' && (
        <div className="modal sheet-wrap" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <p className="sheet__title">選一個 emoji</p>

            {/* 用手機鍵盤輸入任何 emoji */}
            <form className="emoji-input" onSubmit={addTypedEmojis}>
              <input
                className="emoji-input__box"
                value={emojiText}
                onChange={(e) => { setEmojiText(e.target.value); setEmojiHint(''); }}
                placeholder="點這裡，再切換到 😀 鍵盤"
                enterKeyHint="done"
                autoComplete="off"
                aria-label="用鍵盤輸入 emoji"
              />
              <button type="submit" className="emoji-input__add">加入</button>
            </form>
            <p className="emoji-input__hint">{emojiHint || `一次最多 ${EMOJI_INPUT_MAX} 個，也可以從下面直接選`}</p>

            <div className="sheet__grid">
              {MORE_EMOJIS.map((e) => (
                <button key={e} className="emoji-btn" onClick={() => addEmoji(e)}>{e}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 照片編輯面板 */}
      {sheet === 'edit' && editTarget && (
        <div className="modal sheet-wrap" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <p className="sheet__title">編輯照片</p>
            <div className="sheet__actions">
              {editTarget.cut && editTarget.src === editTarget.cut && (
                <button className="btn-outline" onClick={() => { patch(editTarget.id, { src: editTarget.original }); setSheet(null); }}>
                  去背不滿意？改用原圖
                </button>
              )}
              {editTarget.cut && editTarget.src !== editTarget.cut && (
                <button className="btn-outline" onClick={() => { patch(editTarget.id, { src: editTarget.cut }); setSheet(null); }}>
                  改回去背版本
                </button>
              )}
              {!editTarget.cut && (
                <button className="btn-outline" onClick={() => retryCut(editTarget)}>再試一次去背</button>
              )}
              <button className="btn-outline" onClick={() => pickPhoto(editTarget.id)}>換一張照片</button>
              <button className="btn-outline" onClick={() => { remove(editTarget.id); setSheet(null); }}>刪除這張照片</button>
              <button className="btn-solid" style={{ flex: 'none' }} onClick={() => setSheet(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
