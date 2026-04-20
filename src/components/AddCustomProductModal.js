import React, { useState } from 'react';
import { X, Plus, Zap, Scan } from 'lucide-react';
import { toast } from './Toast';
import AnimatedModal from './AnimatedModal';
import BarcodeScannerModal from './BarcodeScannerModal';

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
  const [showScanner, setShowScanner] = useState(false);

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

  // Обробка результату сканування
  const handleBarcodeProduct = (product) => {
    setNewProductName(product.name);
    setNewProductRaw(product.raw.toString());
    setNewProductCooked(product.cooked.toString());
    setNewProductP(product.p.toString());
    setNewProductF(product.f.toString());
    setNewProductC(product.c.toString());
    setNewProductCal(product.cal.toString());
    toast.success(`Знайдено: ${product.name}`);
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
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <div className="flex items-center gap-2">
            <Plus size={20} className="text-[#34C759]" />
            <h3 className="text-[17px] font-semibold text-black">Додати продукт</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowScanner(true)}
              className="p-2 text-[#007AFF] active:opacity-50 bg-[#007AFF]/10 rounded-xl"
              title="Сканувати штрих-код"
            >
              <Scan size={20} />
            </button>
            <button onClick={handleClose} className="p-1 text-[#007AFF] active:opacity-50">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[13px] text-[#8E8E93] mb-2 px-1">Назва продукту</label>
            <input
              type="text"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              placeholder="Наприклад: Курка на грилі"
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
            />
          </div>

          {/* Weight section */}
          <div className="bg-[#F2F2F7] rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-[13px] text-[#8E8E93] mb-2">Вага сирого (г)</label>
              <input
                type="number"
                inputMode="numeric"
                value={newProductRaw}
                onChange={(e) => setNewProductRaw(e.target.value)}
                placeholder="50"
                className="w-full px-4 py-3 bg-white rounded-xl text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
            </div>

            <div>
              <label className="block text-[13px] text-[#8E8E93] mb-2">
                Вага готового (г) <span className="text-[#C7C7CC]">— необов'язково</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={newProductCooked}
                onChange={(e) => setNewProductCooked(e.target.value)}
                placeholder="Якщо не змінюється — залиште порожнім"
                className="w-full px-4 py-3 bg-white rounded-xl text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
              <p className="text-[11px] text-[#8E8E93] mt-2 px-1">
                Якщо продукт не варіться/смажиться — залиште порожнім
              </p>
            </div>
          </div>

          {/* Macros section */}
          <div>
            <label className="block text-[13px] text-[#8E8E93] mb-2 px-1">БЖВ на 100г сирого продукту</label>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#F2F2F7] rounded-xl p-3">
                <label className="block text-[11px] text-[#8E8E93] mb-1 text-center">Білки</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={newProductP}
                  onChange={(e) => setNewProductP(e.target.value)}
                  placeholder="0"
                  className="w-full px-2 py-2 bg-white rounded-lg text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                />
              </div>
              <div className="bg-[#F2F2F7] rounded-xl p-3">
                <label className="block text-[11px] text-[#8E8E93] mb-1 text-center">Жири</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={newProductF}
                  onChange={(e) => setNewProductF(e.target.value)}
                  placeholder="0"
                  className="w-full px-2 py-2 bg-white rounded-lg text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                />
              </div>
              <div className="bg-[#F2F2F7] rounded-xl p-3">
                <label className="block text-[11px] text-[#8E8E93] mb-1 text-center">Вуглеводи</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={newProductC}
                  onChange={(e) => setNewProductC(e.target.value)}
                  placeholder="0"
                  className="w-full px-2 py-2 bg-white rounded-lg text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                />
              </div>
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-2 px-1">
              Знайдіть БЖВ на упаковці або в інтернеті
            </p>
          </div>

          {/* Calories */}
          <div>
            <label className="block text-[13px] text-[#8E8E93] mb-2 px-1">Калорійність (ккал/100г)</label>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={newProductCal}
                onChange={(e) => setNewProductCal(e.target.value)}
                placeholder={calculateCalories().toString()}
                className="flex-1 px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
              <button
                type="button"
                onClick={() => setNewProductCal(calculateCalories().toString())}
                className="px-4 py-3 bg-[#007AFF]/10 text-[#007AFF] rounded-xl text-[15px] font-medium flex items-center gap-1.5 active:bg-[#007AFF]/20"
              >
                <Zap size={16} />
                Авто
              </button>
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-2 px-1">
              Формула: Б×4 + В×4 + Ж×9 = {calculateCalories()} ккал
            </p>
          </div>

          {/* Info */}
          <div className="bg-[#007AFF]/10 rounded-xl p-4">
            <p className="text-[13px] text-[#007AFF]">
              <span className="font-semibold">Увага:</span> Продукт буде доступний всім користувачам. Інші зможуть приховати його у себе.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-[#C6C6C8]/30">
          <button
            onClick={handleSubmit}
            className="w-full py-3 bg-[#34C759] text-white rounded-xl text-[17px] font-semibold active:opacity-80"
          >
            Додати продукт
          </button>
        </div>
      </div>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onProductFound={handleBarcodeProduct}
        toast={toast}
      />
    </AnimatedModal>
  );
}
