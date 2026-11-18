// STEP 1：選擇展覽小夥伴（點卡片 → 彈出「你選擇了⋯」確認）
import React, { useState } from 'react';
import StepHead from '../components/StepHead.jsx';
import { CHARACTERS } from '../../data/characters.js';

export default function ChooseCharacter({ onConfirm }) {
  const [picked, setPicked] = useState(null); // 目前點開確認視窗的小夥伴

  return (
    <main className="page">
      <StepHead no={1} title="選擇你的展覽小夥伴" />

      <div className="char-list">
        {CHARACTERS.map((c) => (
          <button key={c.id} className="glass char-card" onClick={() => setPicked(c)}>
            <img className="char-card__img" src={c.img} alt="" />
            <div>
              <p className="char-card__name">{c.name}</p>
              <p className="char-card__desc">{c.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* 確認視窗：點背景或 ✕ 可以取消重選 */}
      {picked && (
        <div className="modal" onClick={() => setPicked(null)}>
          <button className="confirm__close" aria-label="關閉" onClick={() => setPicked(null)}>✕</button>
          <div className="confirm" onClick={(e) => e.stopPropagation()}>
            <p className="confirm__label">你選擇了⋯</p>
            <img className="confirm__img" src={picked.img} alt="" />
            <p className="confirm__name">{picked.name}</p>
            <button className="pill" onClick={() => onConfirm(picked)}>確定</button>
          </div>
        </div>
      )}
    </main>
  );
}
