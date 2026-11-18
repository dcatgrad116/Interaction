// STEP 3：為你的展覽小夥伴發聲（留一句話＋暱稱，然後送出）
import React, { useState } from 'react';
import StepHead from '../components/StepHead.jsx';
import { submitWork, MESSAGE_MAX, NAME_MAX } from '../../lib/store.js';

export default function Message({ artwork, character, form, setForm, onBack, onDone }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async () => {
    const name = form.name.trim();
    if (!name) return setError('請留下你的暱稱，大螢幕上會顯示喔！');
    setError('');
    setSending(true);
    try {
      await submitWork({
        image: artwork,
        name,
        message: form.message.trim(),
        character: character.id,
      });
      onDone();
    } catch {
      setError('上傳失敗了，請確認網路後再試一次 🙏');
      setSending(false);
    }
  };

  return (
    <main className="page" style={{ paddingTop: 86 }}>
      <StepHead no={3} title="為你的展覽小夥伴發聲" />
      <p className="lead">
        最後一步！請欣賞你媲美蒙娜麗莎的作品～
        <br />
        然後如果可以的話，請在下方留下一句話：
        <br />
        你想對來看展的大家說些什麼？
      </p>

      <div className="glass preview-card">
        <img src={artwork} alt="你的作品" />
      </div>

      <label className="field">
        <span className="field__label">想替你的作品留一句話嗎？（選填）</span>
        <textarea
          className="field__box"
          rows={2}
          maxLength={MESSAGE_MAX}
          placeholder="例：我想吃磨豆的豆花啦"
          value={form.message}
          onChange={update('message')}
        />
        <p className="field__count">{form.message.length} / {MESSAGE_MAX}</p>
      </label>

      <label className="field">
        <span className="field__label">你的大名（暱稱）｜限 {NAME_MAX} 字內</span>
        <input
          className="field__box"
          maxLength={NAME_MAX}
          placeholder="例：黃色爆米花"
          value={form.name}
          onChange={update('name')}
        />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="pill-row" style={{ gap: 38 }}>
        <button className="pill" onClick={onBack} disabled={sending}>上一步</button>
        <button className="pill" style={{ fontWeight: 700 }} onClick={submit} disabled={sending}>
          {sending ? '上傳中⋯' : '送出'}
        </button>
      </div>
    </main>
  );
}
