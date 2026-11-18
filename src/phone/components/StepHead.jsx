// 每一步上方的標題區：STEP N ＋ 標題 ＋ 星星線
import React from 'react';

export default function StepHead({ no, title }) {
  return (
    <header className="step-head">
      <div>
        <p className="step-head__no">STEP {no}</p>
        <h1 className="step-head__title">{title}</h1>
      </div>
      <div className="starline">
        <img src="/assets/starline.webp" alt="" />
      </div>
    </header>
  );
}
