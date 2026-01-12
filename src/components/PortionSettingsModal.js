import React, { useState } from 'react';
import { X, Settings, RotateCcw, Search } from 'lucide-react';
import { DEFAULT_PORTIONS } from '../data/products';
import AnimatedModal from './AnimatedModal';

const PRODUCT_CATEGORIES = {
  "Вуглеводи (а, г)": [
    "бобові", "картопля", "кукурудза свіжа", "рис нешліфований",
    "будь-яка крупа", "цільнозернове борошно", "хлібці",
    "цільнозерновий хліб", "макарони т.с.", "лаваш"
  ],
  "Молочні - прийом 1 (б)": [
    "сир кисломолочний 0,2%", "сири м'які/тверді/плавлені",
    "сметана 15%", "кефір 1%", "йогурт несолодкий 1%", "молоко 1%"
  ],
  "Молочні - прийом 3 (ж)": [
    "сир кисломолочний 0,2% (ж)", "сири м'які/тверді/плавлені (ж)",
    "сметана 15% (ж)", "кефір 1% (ж)", "йогурт несолодкий 1% (ж)", "молоко 1% (ж)"
  ],
  "Вільний вибір (в)": [
    "будь-що", "фрукти", "банани"
  ],
  "Білки (д, і)": [
    "телятина", "печінка", "куряче філе", "індиче філе",
    "риба до 5% жиру", "риба від 5% жиру", "3 яйця", "морепродукти"
  ],
  "Овочі (е, ї)": [
    "овочі свіжі", "овочі квашені", "зелень", "гриби"
  ],
  "Жири (є, й)": [
    "олія лляна", "будь-яка олія", "авокадо", "оливки",
    "гірчиця", "майонез", "кетчуп", "масло", "сало"
  ],
  "Фрукти (з)": [
    "фрукти та ягоди", "банани/виноград/хурма"
  ],
  "Горіхи (и)": [
    "грецькі горіхи", "будь-які горіхи", "насіння"
  ]
};

export default function PortionSettingsModal({
  isOpen,
  onClose,
  userPortions,
  onPortionsChange,
  getUserCustomProducts
}) {
  const [portionSearchQuery, setPortionSearchQuery] = useState("");
  const [editingPortions, setEditingPortions] = useState({});

  const handleClose = () => {
    setPortionSearchQuery("");
    setEditingPortions({});
    onClose();
  };

  const handleReset = () => {
    onPortionsChange(DEFAULT_PORTIONS);
    setPortionSearchQuery("");
    setEditingPortions({});
  };

  const getProductPortion = (productName) => {
    if (userPortions[productName]) return userPortions[productName];
    if (DEFAULT_PORTIONS[productName]) return DEFAULT_PORTIONS[productName];
    return 100;
  };

  const letterToCategory = {
    'а': 'Вуглеводи (а, г)',
    'г': 'Вуглеводи (а, г)',
    'б': 'Молочні - прийом 1 (б)',
    'ж': 'Молочні - прийом 3 (ж)',
    'в': 'Вільний вибір (в)',
    'д': 'Білки (д, і)',
    'і': 'Білки (д, і)',
    'е': 'Овочі (е, ї)',
    'ї': 'Овочі (е, ї)',
    'є': 'Жири (є, й)',
    'й': 'Жири (є, й)',
    'з': 'Фрукти (з)',
    'и': 'Горіхи (и)'
  };

  // Add custom products to categories
  const productCategories = { ...PRODUCT_CATEGORIES };
  const customProducts = getUserCustomProducts();
  Object.keys(customProducts).forEach(letter => {
    const categoryName = letterToCategory[letter];
    if (categoryName && customProducts[letter]) {
      customProducts[letter].forEach(product => {
        if (!productCategories[categoryName].includes(product.name)) {
          productCategories[categoryName] = [...productCategories[categoryName], product.name];
        }
      });
    }
  });

  const searchLower = portionSearchQuery.toLowerCase();

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleClose} position="bottom">
      <div className="bg-white w-full sm:max-w-2xl flex flex-col rounded-t-2xl" style={{ height: '85vh', maxHeight: '85vh' }}>
        {/* Header */}
        <div className="flex-shrink-0 border-b border-[#C6C6C8]/30 px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Settings size={20} className="text-[#FF9500]" />
              <h3 className="text-[17px] font-semibold text-black">Мої порції</h3>
            </div>
            <button onClick={handleClose} className="p-1 text-[#007AFF] active:opacity-50">
              <X size={24} />
            </button>
          </div>
          <p className="text-[13px] text-[#8E8E93] mb-3">Змініть вагу порцій під себе</p>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93]" />
            <input
              type="text"
              placeholder="Пошук продукту..."
              value={portionSearchQuery}
              onChange={(e) => setPortionSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[#F2F2F7] rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#F2F2F7]">
          <div className="space-y-4 pb-4">
            {Object.entries(productCategories).map(([categoryName, products]) => {
              const filteredProducts = searchLower
                ? products.filter(p => p.toLowerCase().includes(searchLower))
                : products;

              if (filteredProducts.length === 0) return null;

              return (
                <div key={categoryName}>
                  <h4 className="text-[13px] font-semibold text-[#8E8E93] mb-2 sticky top-0 bg-[#F2F2F7] py-2 z-10 uppercase tracking-wide">
                    {categoryName}
                  </h4>
                  <div className="bg-white rounded-xl overflow-hidden">
                    {filteredProducts.map((productName, idx) => {
                      const currentValue = editingPortions[productName] !== undefined
                        ? editingPortions[productName]
                        : getProductPortion(productName);

                      const isCustomProduct = !DEFAULT_PORTIONS[productName];
                      const defaultValue = DEFAULT_PORTIONS[productName] || userPortions[productName] || 100;

                      return (
                        <div
                          key={productName}
                          className={`px-4 py-3 ${idx < filteredProducts.length - 1 ? 'border-b border-[#C6C6C8]/30' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 mr-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[15px] text-black">{productName}</span>
                                {isCustomProduct && (
                                  <span className="text-[11px] bg-[#34C759]/10 text-[#34C759] px-2 py-0.5 rounded-full font-medium">
                                    власний
                                  </span>
                                )}
                              </div>
                              <span className="text-[13px] text-[#8E8E93]">Стандарт: {defaultValue}г</span>
                            </div>
                            <div className="relative w-24">
                              <input
                                type="number"
                                inputMode="numeric"
                                value={currentValue}
                                onChange={(e) => {
                                  setEditingPortions({ ...editingPortions, [productName]: e.target.value });
                                }}
                                onBlur={(e) => {
                                  const val = parseInt(e.target.value) || defaultValue;
                                  onPortionsChange({ ...userPortions, [productName]: val });
                                  setEditingPortions({ ...editingPortions, [productName]: undefined });
                                }}
                                className="w-full px-3 py-2 bg-[#F2F2F7] rounded-lg text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93] text-[13px]">г</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {searchLower && Object.values(productCategories).every(products =>
              products.filter(p => p.toLowerCase().includes(searchLower)).length === 0
            ) && (
              <div className="text-center py-12">
                <Search size={40} className="mx-auto text-[#C7C7CC] mb-3" />
                <p className="text-[15px] text-[#8E8E93]">Нічого не знайдено</p>
                <p className="text-[13px] text-[#C7C7CC] mt-1">Спробуйте інший запит</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[#C6C6C8]/30 px-4 py-3 bg-white">
          <button
            onClick={handleReset}
            className="w-full py-3 bg-[#F2F2F7] text-[#007AFF] rounded-xl text-[17px] font-medium flex items-center justify-center gap-2 active:bg-[#E5E5EA]"
          >
            <RotateCcw size={18} />
            Скинути на стандарт
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}
