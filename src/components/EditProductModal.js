import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Pencil, Zap } from 'lucide-react';
import { toast } from './Toast';
import AnimatedModal from './AnimatedModal';

export default function EditProductModal({
  isOpen,
  onClose,
  product,
  originalProduct,
  onSave,
  onReset
}) {
  const [p, setP] = useState("");
  const [f, setF] = useState("");
  const [c, setC] = useState("");
  const [cal, setCal] = useState("");

  useEffect(() => {
    if (product) {
      setP(product.p?.toString() || "0");
      setF(product.f?.toString() || "0");
      setC(product.c?.toString() || "0");
      setCal(product.cal?.toString() || "");
    }
  }, [product]);

  // Автоматичний розрахунок калорійності
  const calculateCalories = () => {
    const pVal = parseFloat(p) || 0;
    const fVal = parseFloat(f) || 0;
    const cVal = parseFloat(c) || 0;
    return Math.round(pVal * 4 + cVal * 4 + fVal * 9);
  };

  const handleAutoCalc = () => {
    setCal(calculateCalories().toString());
  };

  const handleSave = () => {
    const pVal = parseFloat(p) || 0;
    const fVal = parseFloat(f) || 0;
    const cVal = parseFloat(c) || 0;
    const calVal = cal ? parseFloat(cal) : calculateCalories();

    onSave({
      p: pVal,
      f: fVal,
      c: cVal,
      cal: calVal
    });

    toast.success("Значення БЖВ оновлено!");
    onClose();
  };

  const handleReset = () => {
    if (originalProduct) {
      setP(originalProduct.p?.toString() || "0");
      setF(originalProduct.f?.toString() || "0");
      setC(originalProduct.c?.toString() || "0");
      setCal(originalProduct.cal?.toString() || "");
      onReset();
      toast.success("Скинуто до стандартних значень");
    }
  };

  const hasChanges = originalProduct && (
    parseFloat(p) !== originalProduct.p ||
    parseFloat(f) !== originalProduct.f ||
    parseFloat(c) !== originalProduct.c ||
    (cal && parseFloat(cal) !== originalProduct.cal)
  );

  if (!product) return null;

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <div className="flex items-center gap-2">
            <Pencil size={20} className="text-[#007AFF]" />
            <h3 className="text-[17px] font-semibold text-black">Редагувати БЖВ</h3>
          </div>
          <button onClick={onClose} className="p-1 text-[#007AFF] active:opacity-50">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Product Info */}
          <div className="bg-[#F2F2F7] rounded-xl p-4">
            <div className="text-[17px] font-semibold text-black">{product.name}</div>
            <div className="text-[13px] text-[#8E8E93] mt-1">Значення на 100г сирого продукту</div>
          </div>

          {/* Macros */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#F2F2F7] rounded-xl p-3">
              <label className="block text-[11px] text-[#8E8E93] mb-1 text-center">Білки (г)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={p}
                onChange={(e) => setP(e.target.value)}
                className="w-full px-2 py-2 bg-white rounded-lg text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
            </div>
            <div className="bg-[#F2F2F7] rounded-xl p-3">
              <label className="block text-[11px] text-[#8E8E93] mb-1 text-center">Жири (г)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={f}
                onChange={(e) => setF(e.target.value)}
                className="w-full px-2 py-2 bg-white rounded-lg text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
            </div>
            <div className="bg-[#F2F2F7] rounded-xl p-3">
              <label className="block text-[11px] text-[#8E8E93] mb-1 text-center">Вуглеводи (г)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={c}
                onChange={(e) => setC(e.target.value)}
                className="w-full px-2 py-2 bg-white rounded-lg text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
            </div>
          </div>

          {/* Calories */}
          <div>
            <label className="block text-[13px] text-[#8E8E93] mb-2 px-1">Калорійність (ккал/100г)</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={cal}
                onChange={(e) => setCal(e.target.value)}
                placeholder={calculateCalories().toString()}
                className="flex-1 px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
              <button
                onClick={handleAutoCalc}
                className="px-4 py-3 bg-[#007AFF]/10 text-[#007AFF] rounded-xl text-[15px] font-medium flex items-center gap-1.5 active:bg-[#007AFF]/20"
                title="Авторозрахунок"
              >
                <Zap size={16} />
                Авто
              </button>
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-2 px-1">
              Формула: Б×4 + В×4 + Ж×9 = {calculateCalories()} ккал
            </p>
          </div>

          {/* Original values warning */}
          {originalProduct && hasChanges && (
            <div className="bg-[#FF9500]/10 rounded-xl p-4">
              <p className="text-[13px] text-[#FF9500]">
                <span className="font-semibold">Оригінальні значення:</span><br />
                Б: {originalProduct.p}г · Ж: {originalProduct.f}г · В: {originalProduct.c}г · {originalProduct.cal} ккал
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-[#C6C6C8]/30">
          <div className="flex gap-3">
            {originalProduct && (
              <button
                onClick={handleReset}
                className="flex-1 py-3 bg-[#F2F2F7] text-[#8E8E93] rounded-xl text-[17px] font-medium flex items-center justify-center gap-2 active:bg-[#E5E5EA]"
              >
                <RotateCcw size={18} />
                Скинути
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex-1 py-3 bg-[#34C759] text-white rounded-xl text-[17px] font-semibold active:opacity-80"
            >
              Зберегти
            </button>
          </div>
        </div>
      </div>
    </AnimatedModal>
  );
}
