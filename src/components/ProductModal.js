import React, { useState } from 'react';
import { X, Plus, Pencil } from 'lucide-react';
import { PRODUCTS_DB, CATEGORY_ICONS } from '../data/products';
import AnimatedModal from './AnimatedModal';
import EditProductModal from './EditProductModal';

export default function ProductModal({
  isOpen,
  currentLetter,
  selectedMeal,
  meals,
  currentUser,
  onClose,
  getAllProducts,
  getProductPortion,
  getProductWithOverrides,
  getOriginalProduct,
  addProduct,
  addProductWithCustomGrams,
  deleteCustomProduct,
  onShowAddCustomProduct,
  onSaveProductOverride,
  onResetProductOverride
}) {
  const [customGrams, setCustomGrams] = useState({});
  const [editingProduct, setEditingProduct] = useState(null);

  if (!currentLetter) return null;

  const products = getAllProducts(currentLetter);

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} position="bottom">
      <div className="bg-white w-full sm:max-w-md flex flex-col" style={{ height: '85vh', maxHeight: '85vh', borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}>
        <div className="flex-shrink-0 bg-white border-b px-4 py-3" style={{ borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <img src={CATEGORY_ICONS[currentLetter]} alt={PRODUCTS_DB[currentLetter].name} className="w-12 h-12 object-cover rounded-lg shadow-sm" />
              <div>
                <h3 className="text-base font-semibold">Категорія {currentLetter}</h3>
                <div className="text-xs text-gray-600">{PRODUCTS_DB[currentLetter].name} ~ {PRODUCTS_DB[currentLetter].calories} ккал</div>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          </div>
          <button
            onClick={onShowAddCustomProduct}
            className="mt-2 w-full py-2 bg-green-100 text-green-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 hover:bg-green-200 transition-colors"
          >
            <Plus size={16} />
            Додати свій продукт
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
          <div className="space-y-2 pb-4">
            {products.map((product, idx) => {
              const currentProducts = meals[selectedMeal][currentLetter] || [];
              const currentTotal = currentProducts.reduce((sum, p) => sum + p.portion, 0);
              const canAdd100 = currentTotal === 0;
              const canAdd50 = currentTotal <= 50;

              const userPortion = getProductPortion(product.name);
              const grams100 = userPortion;
              const grams50 = Math.round(userPortion / 2);

              const isCustom = !product.verified;
              const isMyProduct = isCustom && product.addedById === currentUser;

              return (
                <div
                  key={idx}
                  className={`bg-white rounded-lg p-3 shadow-sm border transition-all duration-200 hover:shadow-md ${isCustom ? 'border-green-300' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="font-semibold text-sm">{product.name}</div>
                        {isCustom && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            {isMyProduct ? '👤 моє' : `👤 ${product.addedBy}`}
                          </span>
                        )}
                        {product.isOverridden && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            змінено
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600">
                        Порція: {userPortion}г
                        {product.cooked && product.coef !== 1 && ` → ${Math.round(product.cooked * userPortion / product.raw)}г`}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Б:{product.p}г Ж:{product.f}г В:{product.c}г | {product.cal || Math.round(product.p*4 + product.c*4 + product.f*9)} ккал
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingProduct(product)}
                        className="text-gray-400 hover:text-blue-500 p-1 transition-colors"
                        title="Редагувати БЖВ"
                      >
                        <Pencil size={16} />
                      </button>
                      {isCustom && (
                        <button
                          onClick={() => {
                            const standardCount = PRODUCTS_DB[currentLetter]?.products.length || 0;
                            const customIndex = idx - standardCount;
                            deleteCustomProduct(currentLetter, customIndex);
                          }}
                          className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                          title="Приховати продукт"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => addProduct(currentLetter, product, 100)}
                      disabled={!canAdd100}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                        canAdd100 ? 'text-white hover:opacity-90 active:scale-95' : 'bg-gray-100 text-gray-400'
                      }`}
                      style={canAdd100 ? { backgroundColor: '#90bd92' } : {}}
                    >
                      100% ({grams100}г)
                    </button>
                    <button
                      onClick={() => addProduct(currentLetter, product, 50)}
                      disabled={!canAdd50}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                        canAdd50 ? 'text-white hover:opacity-90 active:scale-95' : 'bg-gray-100 text-gray-400'
                      }`}
                      style={canAdd50 ? { backgroundColor: '#c1d7bf' } : {}}
                    >
                      50% ({grams50}г)
                    </button>
                  </div>

                  <div className="border-t pt-3">
                    <div className="text-xs text-gray-500 mb-2">Або введіть свою вагу:</div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="0"
                          value={customGrams[`${currentLetter}_${product.name}`] || ""}
                          onChange={(e) => {
                            const productKey = `${currentLetter}_${product.name}`;
                            setCustomGrams({ ...customGrams, [productKey]: e.target.value });
                          }}
                          className="w-full px-3 py-2 pr-8 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-shadow"
                        />
                        <span className="absolute right-3 top-2 text-gray-500 text-sm">г</span>
                      </div>
                      <button
                        onClick={() => {
                          const productKey = `${currentLetter}_${product.name}`;
                          const inputGrams = parseInt(customGrams[productKey]) || 0;
                          if (inputGrams > 0) {
                            addProductWithCustomGrams(currentLetter, product, inputGrams, userPortion);
                            setCustomGrams({ ...customGrams, [productKey]: "" });
                          }
                        }}
                        className="px-4 py-2 text-white rounded-lg text-sm font-semibold hover:opacity-90 active:scale-95 transition-all duration-150"
                        style={{ backgroundColor: '#638666' }}
                      >
                        Додати
                      </button>
                    </div>
                    {customGrams[`${currentLetter}_${product.name}`] && parseInt(customGrams[`${currentLetter}_${product.name}`]) > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        {parseInt(customGrams[`${currentLetter}_${product.name}`])}г = {Math.round((parseInt(customGrams[`${currentLetter}_${product.name}`]) / userPortion) * 100)}%
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <EditProductModal
        isOpen={!!editingProduct}
        onClose={() => setEditingProduct(null)}
        product={editingProduct}
        originalProduct={editingProduct ? getOriginalProduct(editingProduct.name) : null}
        onSave={(newValues) => {
          if (editingProduct) {
            onSaveProductOverride(editingProduct.name, newValues);
          }
        }}
        onReset={() => {
          if (editingProduct) {
            onResetProductOverride(editingProduct.name);
          }
        }}
      />
    </AnimatedModal>
  );
}
