import React, { useState } from 'react';
import { Check, X, Settings, ChevronDown, Scale, Sunrise, Sun, Sunset, Moon } from 'lucide-react';

// iOS іконки для прийомів їжі
const MEAL_ICONS = {
  1: { icon: Sunrise, label: 'Сніданок', color: '#FF9500' },
  2: { icon: Sun, label: 'Обід', color: '#FFCC00' },
  3: { icon: Sunset, label: 'Вечеря', color: '#FF6B00' },
  4: { icon: Moon, label: 'Перекус', color: '#5856D6' }
};

export default function Header({
  user,
  programDay,
  currentWeight,
  macros,
  selectedMeal,
  onWeightChange,
  onNameChange,
  onMealSelect,
  onShowDaySelector,
  onShowMeasurements,
  onShowSettings
}) {
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [tempWeight, setTempWeight] = useState(currentWeight);

  const proteinPercent = Math.round((macros.p / 140) * 100);

  return (
    <div className="max-w-lg mx-auto">
      {/* iOS Navigation Bar */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-black/5">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left - Profile + Day */}
            <div className="flex items-center gap-3">
              {isEditingName ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={editingNameValue}
                    onChange={(e) => setEditingNameValue(e.target.value)}
                    className="px-3 py-1.5 bg-[#F2F2F7] rounded-lg text-[15px] w-28 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (editingNameValue.trim()) {
                        onNameChange(editingNameValue.trim());
                      }
                      setIsEditingName(false);
                    }}
                    className="text-[#34C759] p-1"
                  >
                    <Check size={18} />
                  </button>
                  <button onClick={() => setIsEditingName(false)} className="text-[#8E8E93] p-1">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <span
                  className="font-semibold text-[17px] cursor-pointer active:opacity-60"
                  onClick={() => {
                    setEditingNameValue(user?.name || "");
                    setIsEditingName(true);
                  }}
                >
                  {user?.name}
                </span>
              )}

              {/* Day badge */}
              <button
                onClick={onShowDaySelector}
                className="flex items-center gap-1 px-2 py-1 bg-[#007AFF]/10 rounded-full active:opacity-60"
              >
                <span className="text-[13px] text-[#007AFF]">День</span>
                <span className="text-[15px] font-bold text-[#007AFF]">{programDay}</span>
                <ChevronDown size={14} className="text-[#007AFF]" />
              </button>
            </div>

            {/* Right - Weight/Measurements + Settings */}
            <div className="flex items-center gap-1">
              {isEditingWeight ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.1"
                    value={tempWeight || ""}
                    onChange={(e) => setTempWeight(e.target.value ? parseFloat(e.target.value) : null)}
                    className="w-16 px-2 py-1.5 bg-[#F2F2F7] rounded-lg text-[15px] text-center focus:outline-none"
                    placeholder="кг"
                    autoFocus
                  />
                  <button onClick={() => {
                    onWeightChange(tempWeight);
                    setIsEditingWeight(false);
                  }} className="text-[#34C759] p-1">
                    <Check size={18} />
                  </button>
                  <button onClick={() => setIsEditingWeight(false)} className="text-[#8E8E93] p-1">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center bg-[#F2F2F7] rounded-full">
                  {/* Іконка - відкриває заміри */}
                  <button
                    onClick={onShowMeasurements}
                    className="p-2 active:bg-[#E5E5EA] rounded-l-full"
                  >
                    <Scale size={18} className="text-[#007AFF]" />
                  </button>
                  {/* Вага - редагування */}
                  <button
                    onClick={() => {
                      setTempWeight(currentWeight);
                      setIsEditingWeight(true);
                    }}
                    className="pr-3 py-1.5 text-[13px] font-medium text-[#8E8E93] active:bg-[#E5E5EA] rounded-r-full"
                  >
                    {currentWeight ? `${currentWeight} кг` : 'Вага'}
                  </button>
                </div>
              )}
              <button
                onClick={onShowSettings}
                className="p-2 text-[#8E8E93] active:text-[#007AFF]"
                title="Налаштування"
              >
                <Settings size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Macros Card */}
      <div className="mx-4 mt-4 bg-white rounded-2xl overflow-hidden">
        <div className="px-4 py-4">
          {/* Protein Progress */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] text-[#8E8E93]">Білки</span>
              <span className={`text-[28px] font-bold ${proteinPercent >= 100 ? 'text-[#34C759]' : 'text-[#007AFF]'}`}>
                {macros.p}
              </span>
              <span className="text-[15px] text-[#C7C7CC]">/ 140г</span>
            </div>
            <div className={`px-3 py-1 rounded-full ${proteinPercent >= 100 ? 'bg-[#34C759]/10' : 'bg-[#007AFF]/10'}`}>
              <span className={`text-[15px] font-semibold ${proteinPercent >= 100 ? 'text-[#34C759]' : 'text-[#007AFF]'}`}>
                {proteinPercent}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-[#F2F2F7] rounded-full overflow-hidden mb-4">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(proteinPercent, 100)}%`,
                backgroundColor: proteinPercent >= 100 ? '#34C759' : '#007AFF'
              }}
            />
          </div>

          {/* Other Macros */}
          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-[13px] text-[#8E8E93] mb-0.5">Жири</div>
                <div className="text-[17px] font-semibold">{macros.f}г</div>
              </div>
              <div className="text-center">
                <div className="text-[13px] text-[#8E8E93] mb-0.5">Вуглеводи</div>
                <div className="text-[17px] font-semibold">{macros.c}г</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[13px] text-[#8E8E93] mb-0.5">Калорії</div>
              <div className="text-[22px] font-bold text-[#FF9500]">{macros.cal || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Meal Selector - iOS icons */}
      <div className="mx-4 mt-4 mb-4 bg-white rounded-2xl p-2">
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(num => {
            const meal = MEAL_ICONS[num];
            const Icon = meal.icon;
            const isSelected = selectedMeal === num;

            return (
              <button
                key={num}
                onClick={() => onMealSelect(num)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-[#007AFF]/10'
                    : 'active:bg-[#F2F2F7]'
                }`}
              >
                <Icon
                  size={24}
                  className={isSelected ? 'text-[#007AFF]' : 'text-[#8E8E93]'}
                  style={isSelected ? {} : { color: meal.color }}
                />
                <span className={`text-[11px] font-medium ${isSelected ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}>
                  {meal.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
