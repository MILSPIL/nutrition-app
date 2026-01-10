import React, { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from './Toast';
import AnimatedModal from './AnimatedModal';

export default function AddCustomProductModal({
  isOpen,
  onClose,
  onAddProduct
}) {
  const [newProductName, setNewProductName] = useState("");
  const [newProductRaw, setNewProductRaw] = useState("");
  const [newProductCooked, setNewProductCooked] = useState("");
  const [newProductP, setNewProductP] = useState("");
  const [newProductF, setNewProductF] = useState("");
  const [newProductC, setNewProductC] = useState("");
  const [newProductCal, setNewProductCal] = useState("");

  const handleClose = () => {
    setNewProductName("");
    setNewProductRaw("");
    setNewProductCooked("");
    setNewProductP("");
    setNewProductF("");
    setNewProductC("");
    setNewProductCal("");
    onClose();
  };

  // Розрахунок калорійності
  const calculateCalories = () => {
    const p = parseFloat(newProductP) || 0;
    const f = parseFloat(newProductF) || 0;
    const c = parseFloat(newProductC) || 0;
    return Math.round(p * 4 + c * 4 + f * 9);
  };

  const handleSubmit = () => {
    if (!newProductName.trim() || !newProductRaw) {
      toast.warning("Заповніть всі поля!");
      return;
    }

    const raw = parseInt(newProductRaw);
    const cooked = newProductCooked ? parseInt(newProductCooked) : raw;
    const p = newProductP ? parseFloat(newProductP) : 0;
    const f = newProductF ? parseFloat(newProductF) : 0;
    const c = newProductC ? parseFloat(newProductC) : 0;
    const cal = newProductCal ? parseFloat(newProductCal) : Math.round(p * 4 + c * 4 + f * 9);

    onAddProduct({
      name: newProductName.trim(),
      raw,
      cooked,
      p,
      f,
      c,
      cal
    });

    handleClose();
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleClose}>
      <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">➕ Додати продукт</h3>
          <button onClick={handleClose}>
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Назва продукту</label>
            <input
              type="text"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              placeholder="Наприклад: Курка на грилі"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Вага сирого (г)</label>
            <input
              type="number"
              inputMode="numeric"
              value={newProductRaw}
              onChange={(e) => setNewProductRaw(e.target.value)}
              placeholder="50"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Вага готового (г)
              <span className="text-xs text-gray-500 ml-1">(необов'язково)</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={newProductCooked}
              onChange={(e) => setNewProductCooked(e.target.value)}
              placeholder="Якщо не змінюється - залиште порожнім"
              className="w-full px-3 py-2 border rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Якщо продукт не варіться/смажиться - залиште порожнім
            </p>
          </div>

          <div className="border-t pt-4">
            <label className="block text-sm font-medium mb-2">БЖВ на 100г сирого продукту</label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Білки (г)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={newProductP}
                  onChange={(e) => setNewProductP(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border rounded-lg text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Жири (г)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={newProductF}
                  onChange={(e) => setNewProductF(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border rounded-lg text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Вуглеводи (г)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={newProductC}
                  onChange={(e) => setNewProductC(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border rounded-lg text-center"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              💡 Знайдіть БЖВ на упаковці або в інтернеті
            </p>

            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">Калорійність (ккал/100г)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={newProductCal}
                  onChange={(e) => setNewProductCal(e.target.value)}
                  placeholder={calculateCalories().toString()}
                  className="flex-1 px-3 py-2 border rounded-lg text-center"
                />
                <button
                  type="button"
                  onClick={() => setNewProductCal(calculateCalories().toString())}
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"
                >
                  Авто
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Формула: Б×4 + В×4 + Ж×9 = {calculateCalories()} ккал
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              <strong>ℹ️ Увага:</strong> Продукт буде доступний всім користувачам. Інші зможуть приховати його у себе.
            </p>
          </div>

          <button
            onClick={handleSubmit}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold"
          >
            Додати продукт
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}
