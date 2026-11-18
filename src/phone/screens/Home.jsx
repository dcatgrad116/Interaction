// 首頁：Logo、歡迎文字、出發按鈕
import React, { useEffect } from 'react';
import { preloadRemoveBg } from '../../lib/removeBg.js';

export default function Home({ onStart }) {
  // 使用者在看首頁時，就先在背景下載去背模型，等一下會比較快
  useEffect(() => {
    const t = setTimeout(preloadRemoveBg, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="page home">
      <img className="home__logo" src="/assets/logo.webp" alt="鏡行式" />
      <div className="home__starline">
        <img src="/assets/starline.webp" alt="" />
      </div>
      <p className="home__text">
        歡迎蒞臨《鏡行式》
        <br />
        選一位夥伴陪你一起逛展覽吧！
      </p>
      <button className="pill" onClick={onStart}>出發</button>
    </main>
  );
}
