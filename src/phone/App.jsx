// 手機 App 主流程：首頁 → 選小夥伴 → 裝飾 → 留言 → 完成
// 用一個 step 狀態切換畫面，作品資料放在這裡，按「上一步」也不會不見
import React, { useState } from 'react';
import Home from './screens/Home.jsx';
import ChooseCharacter from './screens/ChooseCharacter.jsx';
import Decorate from './screens/Decorate.jsx';
import Message from './screens/Message.jsx';
import Done from './screens/Done.jsx';

export default function App() {
  const [step, setStep] = useState('home');
  const [character, setCharacter] = useState(null); // 選中的小夥伴
  const [items, setItems] = useState([]); // 畫布上的元素（小夥伴、照片、emoji）
  const [artwork, setArtwork] = useState(null); // 裝飾完輸出的透明 PNG（dataURL）
  const [form, setForm] = useState({ message: '', name: '' }); // 留言與暱稱

  // 換頁時捲回最上面
  const go = (next) => {
    setStep(next);
    window.scrollTo(0, 0);
  };

  // 「再做一個」：清空所有資料，回到選小夥伴
  const restart = () => {
    setCharacter(null);
    setItems([]);
    setArtwork(null);
    setForm({ message: '', name: '' });
    go('choose');
  };

  return (
    <div className="phone">
      {step === 'home' && <Home onStart={() => go('choose')} />}

      {step === 'choose' && (
        <ChooseCharacter
          onConfirm={(c) => {
            // 換了小夥伴：畫布上的小夥伴圖要跟著換，其他裝飾保留
            if (character && character.id !== c.id) {
              setItems((list) => list.map((it) => (it.type === 'char' ? { ...it, src: c.img } : it)));
            }
            setCharacter(c);
            go('decorate');
          }}
        />
      )}

      {step === 'decorate' && (
        <Decorate
          character={character}
          items={items}
          setItems={setItems}
          onBack={() => go('choose')}
          onNext={(png) => {
            setArtwork(png);
            go('message');
          }}
        />
      )}

      {step === 'message' && (
        <Message
          artwork={artwork}
          character={character}
          form={form}
          setForm={setForm}
          onBack={() => go('decorate')}
          onDone={() => go('done')}
        />
      )}

      {step === 'done' && <Done artwork={artwork} name={form.name} onRestart={restart} />}
    </div>
  );
}
