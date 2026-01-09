import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_PORTIONS } from '../data/products';
import AnimatedModal from './AnimatedModal';

const PRODUCT_CATEGORIES = {
  "🍞 Вуглеводи (а, г)": [
    "бобові", "картопля", "кукурудза свіжа", "рис нешліфований",
    "будь-яка крупа", "цільнозернове борошно", "хлібці",
    "цільнозерновий хліб", "макарони т.с.", "лаваш"
  ],
  "🧀 Молочні - прийом 1 (б)": [
    "сир кисломолочний 0,2%", "сири м'які/тверді/плавлені",
    "сметана 15%", "кефір 1%", "йогурт несолодкий 1%", "молоко 1%"
  ],
  "🧀 Молочні - прийом 3 (ж)": [
    "сир кисломолочний 0,2% (ж)", "сири м'які/тверді/плавлені (ж)",
    "сметана 15% (ж)", "кефір 1% (ж)", "йогурт несолодкий 1% (ж)", "молоко 1% (ж)"
  ],
  "🍬 Вільний вибір (в)": [
    "будь-що", "фрукти", "банани"
  ],
  "🍖 Білки (д, і)": [
    "телятина", "печінка", "куряче філе", "індиче філе",
    "риба до 5% жиру", "риба від 5% жиру", "3 яйця", "морепродукти"
  ],
  "🥦 Овочі (е, ї)": [
    "овочі свіжі", "овочі квашені", "зелень", "гриби"
  ],
  "🥑 Жири (є, й)": [
    "олія лляна", "будь-яка олія", "авокадо", "оливки",
    "гірчиця", "майонез", "кетчуп", "масло", "сало"
  ],
  "🍎 Фрукти (з)": [
    "фрукти та ягоди", "банани/виноград/хурма"
  ],
  "🥜 Горіхи (и)": [
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
    'а': '🍞 Вуглеводи (а, г)',
    'г': '🍞 Вуглеводи (а, г)',
    'б': '🧀 Молочні - прийом 1 (б)',
    'ж': '🧀 Молочні - прийом 3 (ж)',
    'в': '🍬 Вільний вибір (в)',
    'д': '🍖 Білки (д, і)',
    'і': '🍖 Білки (д, і)',
    'е': '🥦 Овочі (е, ї)',
    'ї': '🥦 Овочі (е, ї)',
    'є': '🥑 Жири (є, й)',
    'й': '🥑 Жири (є, й)',
    'з': '🍎 Фрукти (з)',
    'и': '🥜 Горіхи (и)'
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
      <div className="bg-white w-full sm:max-w-2xl flex flex-col" style={{ height: '85vh', maxHeight: '85vh', borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}>
        <div className="flex-shrink-0 bg-white border-b px-4 py-3" style={{ borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-semibold">⚙️ Мої порції</h3>
            <button onClick={handleClose} className="text-gray-400">
              <X size={24} />
            </button>
          </div>
          <div className="text-xs text-gray-500 mb-3">Змініть вагу порцій під себе</div>

          <input
            type="text"
            placeholder="🔍 Пошук продукту..."
            value={portionSearchQuery}
            onChange={(e) => setPortionSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          <div className="space-y-4 pb-4">
            {Object.entries(productCategories).map(([categoryName, products]) => {
              const filteredProducts = searchLower
                ? products.filter(p => p.toLowerCase().includes(searchLower))
                : products;

              if (filteredProducts.length === 0) return null;

              return (
                <div key={categoryName}>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 sticky top-0 bg-gray-50 py-2 z-10 border-b border-gray-200">
                    {categoryName}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {filteredProducts.map(productName => {
                      const currentValue = editingPortions[productName] !== undefined
                        ? editingPortions[productName]
                        : getProductPortion(productName);

                      const isCustomProduct = !DEFAULT_PORTIONS[productName];
                      const defaultValue = DEFAULT_PORTIONS[productName] || userPortions[productName] || 100;

                      return (
                        <div key={productName} className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm text-blue-600">{productName}</span>
                                {isCustomProduct && (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">👤 власний</span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">Стандарт: {defaultValue}г</span>
                            </div>
                          </div>
                          <div className="relative">
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
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <span className="absolute right-3 top-2 text-gray-500 text-sm">г</span>
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
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">🔍</div>
                <div className="text-sm">Нічого не знайдено за запитом "{portionSearchQuery}"</div>
                <div className="text-xs mt-1">Спробуйте інший запит</div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 border-t px-4 py-3 bg-white">
          <button
            onClick={handleReset}
            className="w-full py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            🔄 Скинути на стандарт
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}
