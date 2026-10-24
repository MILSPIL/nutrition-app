import { CATEGORY_ICONS } from '../data/categoryIcons';
import React, { useState } from 'react';
import { Plus, Trash2, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { PRODUCTS_DB, MEAL_LETTERS } from '../data/products';
import { itemMacros, quantityText, sourceText, UNITS } from '../services/mealItems';
import {dailyPlanProgress,itemPlanPercent,percentText} from '../services/planAllocation';
import { getCategoryProgress } from '../services/nutrition';
import CategoryIcon from './CategoryIcon';

export default function MealSection({
  selectedMeal,
  meals,
  onRemoveProduct,
  onOpenProductModal,
  onUpdateProductWeight
}) {
  const [editingProduct, setEditingProduct] = useState(null); // { letter, index }
  const [editWeight, setEditWeight] = useState('');
  const daily=dailyPlanProgress(meals);
  return (
    <div className="max-w-lg mx-auto px-4 mb-6">
      {daily.unallocatedCount > 0 && (
        <p className="mb-2 text-[13px] text-[#6B7280]" role="status">
          Без літери за день: {daily.unallocatedCount}
        </p>
      )}
      {/* iOS Grouped List */}
      <div className="bg-white rounded-2xl overflow-hidden">
        {[...new Set([...MEAL_LETTERS[selectedMeal],...Object.keys(meals[selectedMeal] || {})])].map((letter, index) => {
          const products = meals[selectedMeal]?.[letter] || [];


          const dailyLetter=daily.letters[letter]||{percent:0,unknown:0};
          const progress = getCategoryProgress({isCalorieBased:false,totalPortion:dailyLetter.percent});
          if(dailyLetter.unknown) progress.isComplete=false;
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
                disabled={letter === 'voice'}
                onClick={() => letter !== 'voice' && onOpenProductModal(letter)}
                className="w-full px-4 py-3 flex items-center justify-between active:bg-[#F2F2F7] transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-11 h-11 rounded-xl bg-[#F2F2F7] border border-[#E9E9EE] flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <CategoryIcon
                      src={CATEGORY_ICONS[letter]}
                      alt={PRODUCTS_DB[letter]?.name || 'Без літери'}
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[22px] font-bold text-[#007AFF]">{letter === 'voice' ? '' : letter.toUpperCase()}</span>
                      <span className="text-[17px] font-medium text-black">{(PRODUCTS_DB[letter]?.name || 'Без літери')}</span>
                    </div>
                    {/* Progress bar */}
                    {letter === 'voice' ? <p className="text-[13px] text-[#6B7280]">Калорії враховані</p> : <div className="flex items-center gap-2 mt-1">
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
                        {percentText(dailyLetter.percent)} за день{dailyLetter.unknown>0?" · неповно":""}
                      </span>
                    </div>}
                  </div>
                </div>
                {letter !== 'voice' && <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <Plus size={20} className="text-[#007AFF]" />
                  <ChevronRight size={18} className="text-[#C7C7CC]" />
                </div>}
              </button>

              {/* Selected Products */}
              {products.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="bg-[#F2F2F7] rounded-xl overflow-hidden">
                    {products.map((product, idx) => {
                      const isEditing = editingProduct?.letter === letter && editingProduct?.index === idx;
                      const normPercent = itemPlanPercent(product, letter);

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
                              <div className="text-[15px] text-black break-words">{product.name}{product.rawCookedCoef && product.rawCookedCoef !== 1 ? ' · змінюєте сиру вагу' : ''}</div>
                              <div className="flex items-center gap-2">
                                <div className="relative flex-1 min-w-0">
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={editWeight}
                                    onChange={(e) => setEditWeight(e.target.value)}
                                    autoFocus
                                    className="w-full min-w-0 px-3 py-2 bg-white rounded-lg text-[15px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                                    placeholder={String(product.quantity?.value ?? product.weight)}
                                  />
                                  <span className="absolute right-3 top-2 text-[#8E8E93] text-[13px]">{UNITS[product.quantity?.unit] || 'г'}</span>
                                </div>
                                <button
                                  onClick={() => {
                                    const newWeight = Number(editWeight.replace(',', '.'));
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
                                  setEditWeight(String(product.quantity?.value ?? product.weight));
                                }}
                                className="flex-1 text-left active:opacity-60"
                              >
                                <span className="text-[15px] text-black">{product.name}</span>
                                <span className="text-[13px] text-[#007AFF] ml-2">
                                  {quantityText(product)} · {Math.round(itemMacros(product).cal)} ккал

                                </span>
                                <span className="block text-[11px] text-[#6B7280]">{sourceText(product)}</span>
                                {normPercent == null && <span className="block text-[12px] text-[#9A6700]">Норму не визначено</span>}
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
