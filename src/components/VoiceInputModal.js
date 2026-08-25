import React, { useState } from 'react';
import { Mic, X, Trash2, Loader2 } from 'lucide-react';
import { parseMealText, toMealItems } from '../services/mealParser';
import { PRODUCTS_DB } from '../data/products';

// Прев'ю одного розібраного рядка: назва, ваги, ккал, попередження
function PreviewRow({ item, overLimit, onChangeGrams, onRemove }) {
  const cal = Math.round((item.product.cal || 0) * item.grams / 100);
  const cooked = item.product.coef && item.product.coef !== 1
    ? Math.round(item.grams * item.product.coef)
    : null;

  return (
    <div className="px-3 py-2.5 border-b border-[#C6C6C8]/30 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] text-black break-words">
            <span className="font-semibold text-[#007AFF] mr-1">{item.letter.toUpperCase()}</span>
            {item.product.name}
            {item.estimated && (
              <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-[#FF9500]/15 text-[#FF9500]">
                ≈ оцінка AI
              </span>
            )}
          </div>
          <div className="text-[12px] text-[#8E8E93]">
            {cooked ? `${cooked}г готового (${item.grams}г сир.)` : `${item.grams}г`} · {cal} ккал
          </div>
          {item.note && <div className="text-[12px] text-[#FF9500]">{item.note}</div>}
          {overLimit && (
            <div className="text-[12px] text-[#FF3B30]">перевищить ліміт категорії «в»</div>
          )}
        </div>
        <input
          type="number"
          inputMode="numeric"
          value={item.grams}
          onChange={(e) => onChangeGrams(parseInt(e.target.value, 10) || 0)}
          className="w-16 px-2 py-1.5 bg-[#F2F2F7] rounded-lg text-[15px] text-center focus:outline-none"
        />
        <button onClick={onRemove} className="p-1.5 text-[#FF3B30] active:opacity-50">
          <Trash2 size={17} />
        </button>
      </div>
    </div>
  );
}

export default function VoiceInputModal({ isOpen, selectedMeal, meals, getIdToken, onAdd, onClose }) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('input'); // input | loading | preview
  const [items, setItems] = useState([]);
  const [unparsed, setUnparsed] = useState([]);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleParse = async () => {
    setPhase('loading');
    setError(null);
    try {
      const idToken = await getIdToken();
      const parseResult = await parseMealText({ text, mealNum: selectedMeal, idToken });
      const converted = toMealItems(parseResult, selectedMeal);
      setItems(converted.items);
      setUnparsed(converted.unparsed);
      setPhase('preview');
    } catch (e) {
      setError('Не вдалося розібрати. Перевір інтернет і спробуй ще раз.');
      setPhase('input'); // текст зберігається, нічого не втрачено
    }
  };

  // Попередження про ліміт калорійної категорії «в» (не блокує, тільки лякає)
  const vLimit = PRODUCTS_DB['в']?.calorieLimit || 575;
  const vUsed = (meals[selectedMeal]?.['в'] || []).reduce((sum, p) => sum + (p.calories || 0), 0);
  let vRunning = vUsed;
  const overFlags = items.map((item) => {
    if (item.letter !== 'в') return false;
    vRunning += Math.round((item.product.cal || 0) * item.grams / 100);
    return vRunning > vLimit;
  });

  const validItems = items.filter((item) => item.grams > 0);

  const reset = () => {
    setText('');
    setItems([]);
    setUnparsed([]);
    setError(null);
    setPhase('input');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-t-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-[#C6C6C8]/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic size={18} className="text-[#007AFF]" />
            <span className="text-[17px] font-semibold">Надиктувати їжу</span>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="p-1.5 text-[#8E8E93]">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {phase !== 'preview' && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="Тисни сюди, натисни мікрофон на клавіатурі і кажи: «варена картопля 200 г, два помідори, сметана 20 г...»"
                className="w-full p-3 bg-[#F2F2F7] rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
              {error && <div className="mt-2 text-[13px] text-[#FF3B30]">{error}</div>}
              <button
                onClick={handleParse}
                disabled={!text.trim() || phase === 'loading'}
                className="mt-3 w-full py-3.5 bg-[#007AFF] disabled:opacity-40 text-white rounded-2xl text-[17px] font-semibold active:opacity-80 flex items-center justify-center gap-2"
              >
                {phase === 'loading' && <Loader2 size={18} className="animate-spin" />}
                {phase === 'loading' ? 'Розбираю...' : 'Розібрати'}
              </button>
            </>
          )}

          {phase === 'preview' && (
            <>
              <div className="bg-[#F2F2F7] rounded-xl overflow-hidden">
                {validItems.length === 0 && (
                  <div className="px-3 py-4 text-[14px] text-[#8E8E93] text-center">
                    Нічого не розпізнано
                  </div>
                )}
                {items.map((item, idx) => (
                  <PreviewRow
                    key={idx}
                    item={item}
                    overLimit={overFlags[idx]}
                    onChangeGrams={(grams) => {
                      const next = [...items];
                      next[idx] = { ...item, grams };
                      setItems(next);
                    }}
                    onRemove={() => setItems(items.filter((_, i) => i !== idx))}
                  />
                ))}
              </div>

              {unparsed.length > 0 && (
                <div className="mt-3 p-3 bg-[#FF9500]/10 rounded-xl text-[13px] text-[#B25000]">
                  Не розібрав: {unparsed.join('; ')}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setPhase('input')}
                  className="flex-1 py-3.5 bg-[#F2F2F7] rounded-2xl text-[17px] font-semibold text-[#007AFF] active:opacity-80"
                >
                  Назад
                </button>
                <button
                  onClick={() => {
                    onAdd(validItems);
                    reset();
                    onClose();
                  }}
                  disabled={validItems.length === 0}
                  className="flex-1 py-3.5 bg-[#34C759] disabled:opacity-40 text-white rounded-2xl text-[17px] font-semibold active:opacity-80"
                >
                  Додати ({validItems.length})
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
