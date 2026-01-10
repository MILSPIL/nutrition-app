import React, { useState, useEffect } from 'react';
import { X, RotateCcw } from 'lucide-react';
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
      <div className="bg-white rounded-lg max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Редагувати БЖВ</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="font-medium">{product.name}</div>
          <div className="text-xs text-gray-500">Значення на 100г сирого продукту</div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Білки (г)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={p}
                onChange={(e) => setP(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-center focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Жири (г)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={f}
                onChange={(e) => setF(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-center focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Вуглеводи (г)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={c}
                onChange={(e) => setC(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-center focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Калорійність (ккал/100г)</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={cal}
                onChange={(e) => setCal(e.target.value)}
                placeholder={calculateCalories().toString()}
                className="flex-1 px-3 py-2 border rounded-lg text-center focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handleAutoCalc}
                className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                title="Авторозрахунок"
              >
                Авто
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Формула: Б×4 + В×4 + Ж×9 = {calculateCalories()} ккал
            </p>
          </div>

          {originalProduct && hasChanges && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                <strong>Оригінальні значення:</strong><br />
                Б: {originalProduct.p}г | Ж: {originalProduct.f}г | В: {originalProduct.c}г | {originalProduct.cal} ккал
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {originalProduct && (
              <button
                onClick={handleReset}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
              >
                <RotateCcw size={16} />
                Скинути
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              Зберегти
            </button>
          </div>
        </div>
      </div>
    </AnimatedModal>
  );
}
