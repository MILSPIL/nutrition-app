import React, { useState } from 'react';
import { Plus, Trash2, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { PRODUCTS_DB, MEAL_LETTERS, CATEGORY_ICONS } from '../data/products';
import { getCategoryProgress } from '../services/nutrition';

export default function MealSection({
  selectedMeal,
  meals,
  onRemoveProduct,
  onOpenProductModal,
  onUpdateProductWeight
}) {
  const [editingProduct, setEditingProduct] = useState(null); // { letter, index }
  const [editWeight, setEditWeight] = useState('');
  return (
    <div className="max-w-lg mx-auto px-4 mb-6">
      {/* iOS Grouped List */}
      <div className="bg-white rounded-2xl overflow-hidden">
        {MEAL_LETTERS[selectedMeal].map((letter, index) => {
          const products = meals[selectedMeal][letter] || [];
          const categoryData = PRODUCTS_DB[letter];
          const isCalorieBased = categoryData?.isCalorieBased || false;
          const calorieLimit = categoryData?.calorieLimit || 575;

          // Для калорійних категорій - рахуємо калорії
          const usedCalories = products.reduce((sum, p) => sum + (p.calories || 0), 0);

          // Для звичайних категорій - відсотки
          const totalPortion = products.reduce((sum, p) => sum + p.portion, 0);
          const progress = getCategoryProgress({
            isCalorieBased,
            usedCalories,
            calorieLimit,
            totalPortion
          });
          const progressColor = progress.isOverTarget
            ? '#FF3B30'
            : (progress.isComplete ? '#34C759' : '#007AFF');

          return (
            <div
              key={letter}
              className={index < MEAL_LETTERS[selectedMeal].length - 1 ? 'border-b border-[#C6C6C8]/30' : ''}
            >
              {/* Category Header */}
              <button
                onClick={() => onOpenProductModal(letter)}
                className="w-full px-4 py-3 flex items-center justify-between active:bg-[#F2F2F7] transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-11 h-11 rounded-xl bg-[#F2F2F7] border border-[#E9E9EE] flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <img
                      src={CATEGORY_ICONS[letter]}
                      alt={PRODUCTS_DB[letter].name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[22px] font-bold text-[#007AFF]">{letter.toUpperCase()}</span>
                      <span className="text-[17px] font-medium text-black">{PRODUCTS_DB[letter].name}</span>
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-[#E5E5EA] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${progress.fillPercent}%`,
                            backgroundColor: progressColor
                          }}
                        />
                      </div>
                      <span
                        className="text-[11px] min-w-[44px] text-right"
                        style={{ color: progress.isOverTarget || progress.isComplete ? progressColor : '#8E8E93' }}
                      >
                        {progress.percent}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <Plus size={20} className="text-[#007AFF]" />
                  <ChevronRight size={18} className="text-[#C7C7CC]" />
                </div>
              </button>

              {/* Selected Products */}
              {products.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="bg-[#F2F2F7] rounded-xl overflow-hidden">
                    {products.map((product, idx) => {
                      const isEditing = editingProduct?.letter === letter && editingProduct?.index === idx;

                      return (
                        <div
                          key={idx}
                          className={`px-3 py-2.5 ${
                            idx < products.length - 1 ? 'border-b border-[#C6C6C8]/30' : ''
                          }`}
                        >
                          {isEditing ? (
                            /* Режим редагування */
                            <div className="space-y-2">
                              <div className="text-[15px] text-black break-words">{product.name}</div>
                              <div className="flex items-center gap-2">
                                <div className="relative flex-1 min-w-0">
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={editWeight}
                                    onChange={(e) => setEditWeight(e.target.value)}
                                    autoFocus
                                    className="w-full min-w-0 px-3 py-2 bg-white rounded-lg text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                                    placeholder={String(product.weight)}
                                  />
                                  <span className="absolute right-3 top-2 text-[#8E8E93] text-[13px]">г</span>
                                </div>
                                <button
                                  onClick={() => {
                                    const newWeight = parseInt(editWeight);
                                    if (newWeight > 0) {
                                      onUpdateProductWeight(selectedMeal, letter, idx, newWeight);
                                    }
                                    setEditingProduct(null);
                                    setEditWeight('');
                                  }}
                                  className="p-1.5 text-[#34C759] active:opacity-50 flex-shrink-0"
                                >
                                  <Check size={20} />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingProduct(null);
                                    setEditWeight('');
                                  }}
                                  className="p-1.5 text-[#8E8E93] active:opacity-50 flex-shrink-0"
                                >
                                  <X size={20} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Звичайний режим */
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => {
                                  setEditingProduct({ letter, index: idx });
                                  setEditWeight(String(product.weight));
                                }}
                                className="flex-1 text-left active:opacity-60"
                              >
                                <span className="text-[15px] text-black">{product.name}</span>
                                {product.estimated && (
                                  <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-[#FF9500]/15 text-[#FF9500] align-middle">
                                    ≈ AI
                                  </span>
                                )}
                                <span className="text-[13px] text-[#007AFF] ml-2">
                                  {/* Якщо є готова вага і вона відрізняється від сирої - показуємо готову як основну */}
                                  {product.cookedWeight && product.cookedWeight !== product.weight ? (
                                    <>
                                      {product.cookedWeight}г
                                      <span className="text-[11px] text-[#C7C7CC]"> ({product.weight}г сир.)</span>
                                    </>
                                  ) : (
                                    <>{product.weight}г</>
                                  )}
                                  {/* Для калорійних категорій показуємо калорії */}
                                  {isCalorieBased && product.calories && ` · ${product.calories} ккал`}
                                </span>
                                <Pencil size={12} className="inline ml-1.5 text-[#C7C7CC]" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveProduct(selectedMeal, letter, idx);
                                }}
                                className="p-2 text-[#FF3B30] active:opacity-50"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
