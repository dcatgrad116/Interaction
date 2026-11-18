// STEP 4：完成頁（再做一個／分享作品）
import React from 'react';
import StepHead from '../components/StepHead.jsx';

export default function Done({ artwork, name, onRestart }) {
  // 分享作品：支援的手機會叫出系統分享選單（IG、LINE⋯），不支援就直接下載圖片
  const share = async () => {
    const blob = await (await fetch(artwork)).blob();
    const file = new File([blob], `鏡行式-${name || '我的小夥伴'}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '鏡行式｜我的展覽小夥伴' });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return; // 使用者自己取消分享，不用處理
    }
    // 備案：下載圖片
    const a = document.createElement('a');
    a.href = artwork;
    a.download = file.name;
    a.click();
  };

  return (
    <main className="page" style={{ paddingTop: 86 }}>
      <StepHead no={4} title="你的展覽小夥伴已誕生！" />
      <p className="done__text">
        欸！你的夥伴去哪了？
        <br />
        抬頭看看大螢幕吧🫧
      </p>
      <div className="done__btns">
        <button className="pill pill--wide" onClick={onRestart}>再做一個</button>
        <button className="pill pill--wide" onClick={share}>分享作品</button>
      </div>
    </main>
  );
}
