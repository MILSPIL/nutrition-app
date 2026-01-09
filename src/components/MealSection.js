import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PRODUCTS_DB, MEAL_LETTERS, CATEGORY_ICONS } from '../data/products';

export default function MealSection({
  selectedMeal,
  meals,
  onRemoveProduct,
  onOpenProductModal
}) {
  return (
    <div className="max-w-4xl mx-auto mb-6 bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold mb-4">
        {['1️⃣', '2️⃣', '3️⃣', '4️⃣'][selectedMeal - 1]} Прийом їжі
      </h2>

      {MEAL_LETTERS[selectedMeal].map(letter => (
        <div key={letter} className="mb-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <img src={CATEGORY_ICONS[letter]} alt={PRODUCTS_DB[letter].name} className="w-12 h-12 object-cover rounded-lg shadow-sm" />
                <span className="text-4xl font-bold" style={{ color: '#364f3a' }}>{letter.toUpperCase()}</span>
              </div>

              {meals[selectedMeal][letter] && meals[selectedMeal][letter].length > 0 ? (
                <div className="space-y-1">
                  {meals[selectedMeal][letter].map((product, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-green-50 p-2 rounded">
                      <span className="flex-1 text-sm">
                        {product.name} ({product.weight} г)
                        {product.portion !== 100 && (
                          <span className="text-gray-500 ml-1">— {product.portion}%</span>
                        )}
                      </span>
                      <button
                        onClick={() => onRemoveProduct(selectedMeal, letter, idx)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {(() => {
                    const total = meals[selectedMeal][letter].reduce((sum, p) => sum + p.portion, 0);
                    return total < 100 ? (
                      <div className="text-xs text-blue-600 mt-1">
                        Використано: {total}% (можна ще {100 - total}%)
                      </div>
                    ) : (
                      <div className="text-xs text-green-600 mt-1">
                        ✓ Норма виконана (100%)
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-sm text-gray-400">Не обрано</div>
              )}
            </div>

            <button
              onClick={() => onOpenProductModal(letter)}
              className="ml-4 px-3 py-1 text-white rounded hover:opacity-90 flex items-center gap-1"
              style={{ backgroundColor: '#638666' }}
            >
              <Plus size={16} />
              Вибрати
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
