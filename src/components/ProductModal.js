import React, { useState } from 'react';
import { X, Plus, Pencil } from 'lucide-react';
import { PRODUCTS_DB, CATEGORY_ICONS } from '../data/products';
import { getCategoryProgress } from '../services/nutrition';
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
  const categoryData = PRODUCTS_DB[currentLetter];
  const isCalorieBasedCategory = categoryData?.isCalorieBased || false;
  const calorieLimit = categoryData?.calorieLimit || 575;

  // Розрахунок спожитих калорій для калорійних категорій
  const currentCategoryProducts = meals[selectedMeal]?.[currentLetter] || [];
  const usedCategoryCalories = currentCategoryProducts.reduce((sum, p) => sum + (p.calories || 0), 0);
  const remainingCategoryCalories = calorieLimit - usedCategoryCalories;
  const currentCategoryPortion = currentCategoryProducts.reduce((sum, p) => sum + (p.portion || 0), 0);
  const categoryProgress = getCategoryProgress({
    isCalorieBased: isCalorieBasedCategory,
    usedCalories: usedCategoryCalories,
    calorieLimit,
    totalPortion: currentCategoryPortion
  });

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} position="bottom">
      <div className="flex flex-col" style={{ height: '85vh', maxHeight: '85vh' }}>
        {/* iOS Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-[#C6C6C8]/30">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="text-[#007AFF] font-medium text-[17px] min-w-[70px]"
            >
              Закрити
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#F2F2F7] border border-[#E9E9EE] flex items-center justify-center overflow-hidden">
                <img
                  src={CATEGORY_ICONS[currentLetter]}
                  alt={PRODUCTS_DB[currentLetter].name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="font-semibold text-[17px]">{currentLetter}</span>
            </div>
            <div className="min-w-[70px]" />
          </div>
        </div>

        {/* Category Info */}
        <div className="flex-shrink-0 px-4 py-3 bg-[#F2F2F7]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] font-medium text-black">{categoryData.name}</div>
              {isCalorieBasedCategory ? (
                <div className="text-[13px]">
                  <span className={remainingCategoryCalories > 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}>
                    {remainingCategoryCalories > 0 ? `Залишок: ${remainingCategoryCalories}` : 'Ліміт вичерпано'}
                  </span>
                  <span className="text-[#8E8E93]"> / {calorieLimit} ккал</span>
                </div>
              ) : (
                <div className="text-[13px]">
                  <span className={categoryProgress.isOverTarget ? 'text-[#FF3B30]' : 'text-[#8E8E93]'}>
                    Набрано: {categoryProgress.percent}%
                  </span>
                  {categoryProgress.isOverTarget && (
                    <span className="text-[#FF3B30]"> (+{categoryProgress.percent - 100}% понад норму)</span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onShowAddCustomProduct}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#007AFF] text-white rounded-xl text-[15px] font-medium active:opacity-80"
            >
              <Plus size={18} />
              Свій продукт
            </button>
          </div>
        </div>

        {/* Products List */}
        <div className="flex-1 overflow-y-auto bg-[#F2F2F7]">
          <div className="px-4 py-3">
            <div className="bg-white rounded-2xl overflow-hidden">
              {products.map((product, idx) => {
                const currentProducts = meals[selectedMeal][currentLetter] || [];
                const categoryData = PRODUCTS_DB[currentLetter];
                const isCalorieBased = categoryData?.isCalorieBased || false;
                const calorieLimit = categoryData?.calorieLimit || 575;

                // Для калорійних категорій рахуємо спожиті калорії
                const usedCalories = isCalorieBased
                  ? currentProducts.reduce((sum, p) => sum + (p.calories || 0), 0)
                  : 0;
                const remainingCalories = calorieLimit - usedCalories;

                // Для звичайних категорій - відсоткова логіка
                const canAdd100 = isCalorieBased ? remainingCalories >= (product.cal * product.raw / 100) : true;
                const canAdd50 = isCalorieBased ? remainingCalories >= (product.cal * product.raw / 200) : true;

                const userPortion = getProductPortion(product.name);
                const grams100 = userPortion;
                const grams50 = Math.round(userPortion / 2);

                // Калорії для 100% та 50% порції
                const cal100 = Math.round(product.cal * grams100 / 100);
                const cal50 = Math.round(product.cal * grams50 / 100);

                const isCustom = !product.verified;
                const isMyProduct = isCustom && product.addedById === currentUser;

                return (
                  <div
                    key={idx}
                    className={`${idx < products.length - 1 ? 'border-b border-[#C6C6C8]/30' : ''}`}
                  >
                    {/* Product Header */}
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[17px] font-medium text-black">{product.name}</span>
                            {isCustom && (
                              <span className="text-[11px] bg-[#34C759]/10 text-[#34C759] px-2 py-0.5 rounded-full font-medium">
                                {isMyProduct ? 'моє' : product.addedBy}
                              </span>
                            )}
                            {product.isOverridden && (
                              <span className="text-[11px] bg-[#007AFF]/10 text-[#007AFF] px-2 py-0.5 rounded-full font-medium">
                                змінено
                              </span>
                            )}
                          </div>
                          <div className="text-[13px] text-[#8E8E93] mt-0.5">
                            {userPortion}г · Б:{product.p} Ж:{product.f} В:{product.c} · {product.cal || Math.round(product.p*4 + product.c*4 + product.f*9)} ккал
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingProduct(product)}
                            className="p-2 text-[#007AFF] active:opacity-50"
                            title="Редагувати"
                          >
                            <Pencil size={18} />
                          </button>
                          {isCustom && (
                            <button
                              onClick={() => {
                                const standardCount = PRODUCTS_DB[currentLetter]?.products.length || 0;
                                const customIndex = idx - standardCount;
                                deleteCustomProduct(currentLetter, customIndex);
                              }}
                              className="p-2 text-[#FF3B30] active:opacity-50"
                              title="Видалити"
                            >
                              <X size={18} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quick Add Buttons */}
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => addProduct(currentLetter, product, 100)}
                          disabled={!canAdd100}
                          className={`flex-1 py-2.5 rounded-xl text-[15px] font-semibold transition-all ${
                            canAdd100
                              ? 'bg-[#007AFF] text-white active:opacity-80'
                              : 'bg-[#F2F2F7] text-[#C7C7CC]'
                          }`}
                        >
                          {isCalorieBased ? `${grams100}г (${cal100} ккал)` : `100% (${grams100}г)`}
                        </button>
                        <button
                          onClick={() => addProduct(currentLetter, product, 50)}
                          disabled={!canAdd50}
                          className={`flex-1 py-2.5 rounded-xl text-[15px] font-semibold transition-all ${
                            canAdd50
                              ? 'bg-[#007AFF]/20 text-[#007AFF] active:bg-[#007AFF]/30'
                              : 'bg-[#F2F2F7] text-[#C7C7CC]'
                          }`}
                        >
                          {isCalorieBased ? `${grams50}г (${cal50} ккал)` : `50% (${grams50}г)`}
                        </button>
                      </div>

                      {/* Custom Grams Input */}
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Своя вага"
                            value={customGrams[`${currentLetter}_${product.name}`] || ""}
                            onChange={(e) => {
                              const productKey = `${currentLetter}_${product.name}`;
                              setCustomGrams({ ...customGrams, [productKey]: e.target.value });
                            }}
                            className="w-full px-4 py-2.5 bg-[#F2F2F7] rounded-xl text-[15px] pr-8 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                          />
                          <span className="absolute right-4 top-2.5 text-[#8E8E93] text-[15px]">г</span>
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
                          className="px-5 py-2.5 bg-[#34C759] text-white rounded-xl text-[15px] font-semibold active:opacity-80"
                        >
                          Додати
                        </button>
                      </div>

                      {/* Percentage/Calorie hint */}
                      {customGrams[`${currentLetter}_${product.name}`] && parseInt(customGrams[`${currentLetter}_${product.name}`]) > 0 && (
                        <div className="text-[13px] text-[#8E8E93] mt-2">
                          {(() => {
                            const inputGrams = parseInt(customGrams[`${currentLetter}_${product.name}`]);
                            const inputCalories = Math.round(product.cal * inputGrams / 100);
                            if (isCalorieBased) {
                              return `${inputGrams}г = ${inputCalories} ккал (залишок: ${remainingCalories - inputCalories} ккал)`;
                            }
                            return `${inputGrams}г = ${Math.round((inputGrams / userPortion) * 100)}% норми`;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
