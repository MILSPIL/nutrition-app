import React, { useState } from 'react';
import { ChevronDown, Scan, Zap } from 'lucide-react';
import { toast } from './Toast';
import AnimatedModal from './AnimatedModal';
import BarcodeScannerModal from './BarcodeScannerModal';

function SectionLabel({ color, title, hint }) {
  const titleColor = color === 'green' ? 'text-[#34C759]' : 'text-[#007AFF]';

  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`text-[13px] font-semibold uppercase tracking-[0.08em] ${titleColor}`}>
        {title}
      </span>
      {hint ? (
        <span className="text-[13px] text-[#8E8E93]">{hint}</span>
      ) : null}
    </div>
  );
}

function MacroField({ label, value, onChange, color }) {
  return (
    <div className="bg-[#F2F2F7] rounded-2xl p-2.5">
      <label className="block text-center text-[12px] font-medium mb-1" style={{ color }}>
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          className="w-full px-3 py-2.5 pr-7 bg-white rounded-xl text-[16px] text-center text-black focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#C7C7CC]">
          г
        </span>
      </div>
    </div>
  );
}

export default function AddCustomProductModal({
  isOpen,
  onClose,
  onAddProduct
}) {
  const [newProductName, setNewProductName] = useState('');
  const [newProductRaw, setNewProductRaw] = useState('');
  const [newProductCooked, setNewProductCooked] = useState('');
  const [newProductP, setNewProductP] = useState('');
  const [newProductF, setNewProductF] = useState('');
  const [newProductC, setNewProductC] = useState('');
  const [newProductCal, setNewProductCal] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showCookedField, setShowCookedField] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);

  const resetForm = () => {
    setNewProductName('');
    setNewProductRaw('');
    setNewProductCooked('');
    setNewProductP('');
    setNewProductF('');
    setNewProductC('');
    setNewProductCal('');
    setShowScanner(false);
    setShowCookedField(false);
    setShowHelp(false);
    setScanSuccess(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleBarcodeProduct = (product) => {
    setNewProductName(product.name);
    setNewProductRaw(product.raw.toString());
    setNewProductCooked(product.cooked.toString());
    setNewProductP(product.p.toString());
    setNewProductF(product.f.toString());
    setNewProductC(product.c.toString());
    setNewProductCal(product.cal.toString());
    setShowCookedField(Boolean(product.cooked && product.cooked !== product.raw));
    setScanSuccess(true);
    window.setTimeout(() => setScanSuccess(false), 2200);
    toast.success(`Знайдено: ${product.name}`);
  };

  const calculateCalories = () => {
    const p = parseFloat(newProductP) || 0;
    const f = parseFloat(newProductF) || 0;
    const c = parseFloat(newProductC) || 0;
    return Math.round(p * 4 + c * 4 + f * 9);
  };

  const handleSubmit = () => {
    if (!newProductName.trim() || !newProductRaw) {
      toast.warning('Вкажіть назву і порцію');
      return;
    }

    const raw = parseInt(newProductRaw, 10);
    const cooked = showCookedField && newProductCooked ? parseInt(newProductCooked, 10) : raw;
    const p = newProductP ? parseFloat(newProductP) : 0;
    const f = newProductF ? parseFloat(newProductF) : 0;
    const c = newProductC ? parseFloat(newProductC) : 0;
    const cal = newProductCal ? parseFloat(newProductCal) : calculateCalories();

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

  const servingWeight = parseFloat(newProductRaw) || 0;
  const caloriesPer100 = newProductCal ? parseFloat(newProductCal) : calculateCalories();
  const previewCalories = servingWeight ? Math.round((caloriesPer100 * servingWeight) / 100) : 0;
  const previewProtein = servingWeight ? ((parseFloat(newProductP) || 0) * servingWeight / 100).toFixed(1) : '0.0';
  const previewFat = servingWeight ? ((parseFloat(newProductF) || 0) * servingWeight / 100).toFixed(1) : '0.0';
  const previewCarbs = servingWeight ? ((parseFloat(newProductC) || 0) * servingWeight / 100).toFixed(1) : '0.0';
  const showPreview = servingWeight > 0 && (
    (parseFloat(newProductP) || 0) > 0 ||
    (parseFloat(newProductF) || 0) > 0 ||
    (parseFloat(newProductC) || 0) > 0 ||
    caloriesPer100 > 0
  );

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleClose} position="bottom">
      <div className="bg-white flex flex-col w-full" style={{ height: '85vh', maxHeight: '85vh' }}>
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <button
            type="button"
            onClick={handleClose}
            className="text-[#007AFF] font-medium text-[17px] min-w-[76px] text-left"
          >
            Закрити
          </button>

          <h3 className="text-[17px] font-semibold text-black">Додати продукт</h3>

          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className={`min-w-[76px] px-3 py-2 rounded-xl text-[15px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
              scanSuccess
                ? 'bg-[#34C759]/12 text-[#34C759]'
                : 'bg-[#007AFF]/10 text-[#007AFF] active:bg-[#007AFF]/15'
            }`}
          >
            <Scan size={16} />
            {scanSuccess ? 'Готово' : 'Скан'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-white px-4 pt-4 pb-6">
          <div className="mb-4">
            <label className="block text-[13px] text-[#8E8E93] mb-2 px-0.5">Назва продукту</label>
            <input
              type="text"
              value={newProductName}
              onChange={(event) => setNewProductName(event.target.value)}
              placeholder="Наприклад: курка на грилі"
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-2xl text-[16px] text-black focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
            />
          </div>

          <div className="py-4 border-t border-[#E5E5EA]">
            <SectionLabel color="green" title="Порція" hint="вага однієї" />

            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                value={newProductRaw}
                onChange={(event) => setNewProductRaw(event.target.value)}
                placeholder="50"
                className="w-full px-4 py-3 pr-10 bg-white rounded-2xl border border-[#B7E8C5] text-[18px] text-center text-black focus:outline-none focus:ring-2 focus:ring-[#34C759]/20"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#8E8E93]">г</span>
            </div>

            <p className="text-[12px] leading-[1.45] text-[#8E8E93] mt-2">
              1 цукерка, 1 батончик, 1 стакан. Це звична разова порція = 100%.
            </p>

            <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-[#F0F0F3]">
              <div>
                <div className="text-[16px] text-black">Вага після приготування</div>
                <div className="text-[13px] leading-[1.35] text-[#8E8E93] mt-1">
                  Для м&apos;яса і круп. Для готових продуктів пропустіть.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCookedField((value) => !value)}
                aria-pressed={showCookedField}
                className={`relative flex-shrink-0 w-11 h-[26px] rounded-full transition-colors ${
                  showCookedField ? 'bg-[#34C759]' : 'bg-[#D1D1D6]'
                }`}
              >
                <span
                  className={`absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform ${
                    showCookedField ? 'translate-x-5 left-[2px]' : 'translate-x-0 left-[2px]'
                  }`}
                />
              </button>
            </div>

            {showCookedField ? (
              <div className="mt-3">
                <label className="block text-[13px] text-[#8E8E93] mb-2 px-0.5">
                  Вага після приготування
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newProductCooked}
                    onChange={(event) => setNewProductCooked(event.target.value)}
                    placeholder={newProductRaw || '50'}
                    className="w-full px-4 py-3 pr-10 bg-[#F2F2F7] rounded-2xl text-[16px] text-center text-black focus:outline-none focus:ring-2 focus:ring-[#34C759]/20"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#8E8E93]">г</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="py-4 border-t border-[#E5E5EA]">
            <SectionLabel color="blue" title="На 100 г" hint="як на етикетці" />

            <div className="grid grid-cols-3 gap-2.5">
              <MacroField
                label="Білки"
                value={newProductP}
                onChange={setNewProductP}
                color="#FF6B35"
              />
              <MacroField
                label="Жири"
                value={newProductF}
                onChange={setNewProductF}
                color="#FFB800"
              />
              <MacroField
                label="Вуглев."
                value={newProductC}
                onChange={setNewProductC}
                color="#34C759"
              />
            </div>

            <div className="mt-3">
              <label className="block text-[13px] text-[#8E8E93] mb-2 px-0.5">
                Калорійність (ккал / 100 г)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={newProductCal}
                  onChange={(event) => setNewProductCal(event.target.value)}
                  placeholder={calculateCalories().toString()}
                  className="flex-1 px-4 py-3 bg-white border border-[#CFE1FF] rounded-2xl text-[16px] text-center text-black focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
                />
                <button
                  type="button"
                  onClick={() => setNewProductCal(calculateCalories().toString())}
                  className="px-4 py-3 bg-[#007AFF]/10 text-[#007AFF] rounded-2xl text-[15px] font-medium flex items-center gap-1.5 active:bg-[#007AFF]/15"
                >
                  <Zap size={16} />
                  Авто
                </button>
              </div>
              <p className="text-[12px] leading-[1.45] text-[#8E8E93] mt-2">
                Б×4 + В×4 + Ж×9 = {calculateCalories()} ккал
              </p>
            </div>
          </div>

          {showPreview ? (
            <div className="py-4 border-t border-[#E5E5EA]">
              <div className="px-3 py-2.5 rounded-2xl bg-[#34C759]/8 text-[15px] leading-[1.35] flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[#222]">
                  <span className="font-semibold text-[#34C759]">1 порція ({servingWeight} г)</span>
                  <span className="text-[#8E8E93]"> Б {previewProtein} · Ж {previewFat} · В {previewCarbs}</span>
                </div>
                <div className="text-[16px] font-semibold text-[#34C759]">{previewCalories} ккал</div>
              </div>
            </div>
          ) : null}

          <div className="pt-4 border-t border-[#E5E5EA]">
            <button
              type="button"
              onClick={() => setShowHelp((value) => !value)}
              className="flex items-center gap-1.5 text-[#007AFF] text-[15px] font-medium active:opacity-70"
            >
              Як це працює?
              <ChevronDown
                size={16}
                className={`transition-transform ${showHelp ? 'rotate-180' : ''}`}
              />
            </button>

            {showHelp ? (
              <div className="mt-3 px-3 py-3 rounded-2xl bg-[#F2F2F7] text-[13px] leading-[1.5] text-[#4A4A4A]">
                Порція і БЖВ заповнюються окремо. Якщо цукерка важить 25 г, у порцію ставите 25 г. БЖВ і ккал берете з етикетки на 100 г.
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-shrink-0 px-4 pt-3 pb-5 border-t border-[#C6C6C8]/30 bg-white">
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full py-3.5 bg-[#34C759] text-white rounded-2xl text-[17px] font-semibold active:opacity-80"
          >
            Додати продукт
          </button>
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onProductFound={handleBarcodeProduct}
        toast={toast}
      />
    </AnimatedModal>
  );
}
