import React, { useState } from 'react';
import { Check, X, Settings, ChevronDown, Scale, Sunrise, Sun, Sunset, Moon } from 'lucide-react';

// iOS іконки для прийомів їжі
const MEAL_ICONS = {
  1: { icon: Sunrise, label: 'Сніданок', color: '#FF9500' },
  2: { icon: Sun, label: 'Обід', color: '#FFCC00' },
  3: { icon: Sunset, label: 'Вечеря', color: '#FF6B00' },
  4: { icon: Moon, label: 'Перекус', color: '#5856D6' }
};

const MACRO_TARGETS = {
  p: 140,
  f: 70,
  c: 235
};

const CALORIES_TARGET = (MACRO_TARGETS.p * 4) + (MACRO_TARGETS.f * 9) + (MACRO_TARGETS.c * 4);

const MACRO_PROGRESS = [
  { key: 'p', label: 'Білки', color: '#0A84FF', track: '#DCEBFF' },
  { key: 'f', label: 'Жири', color: '#F5A623', track: '#FCE8BF' },
  { key: 'c', label: 'Вугл.', color: '#34C759', track: '#D9F5DF' }
];

function ProgressRing({ value, target, color }) {
  const size = 88;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = target > 0 ? Math.min(value / target, 1) : 0;
  const dashOffset = circumference * (1 - percent);

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(52, 199, 89, 0.14)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 0.45s ease' }}
      />
    </svg>
  );
}

function MacroProgressRow({ label, value, target, color, track }) {
  const percent = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const remaining = Math.max(target - value, 0);
  const done = value >= target;

  return (
    <div>
      <div className="flex items-end justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium text-[#8E8E93]">{label}</span>
          <span className="text-[14px] font-semibold truncate" style={{ color }}>
            {value}г
          </span>
        </div>
        <span className="text-[11px] text-[#A0A0A7] whitespace-nowrap">
          {done ? 'Ціль закрито' : `${Math.ceil(remaining)}г лишилось`}
        </span>
      </div>

      <div
        className="h-[3px] rounded-full overflow-hidden"
        style={{ backgroundColor: track }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${percent}%`,
            backgroundColor: color,
            transition: 'width 0.45s ease'
          }}
        />
      </div>
    </div>
  );
}

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

  const caloriesValue = macros.cal || 0;

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
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-white/70 shadow-[0_10px_30px_rgba(16,24,40,0.06)] overflow-hidden">
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="absolute inset-1 rounded-full bg-[#34C759]/10 blur-md" />
              <div className="relative w-[88px] h-[88px] flex items-center justify-center">
                <ProgressRing value={caloriesValue} target={CALORIES_TARGET} color="#34C759" />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[24px] leading-none font-bold text-[#34C759]">
                    {caloriesValue}
                  </span>
                  <span className="text-[10px] tracking-[0.06em] uppercase text-[#8E8E93] mt-1">
                    ккал
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-2.5">
              {MACRO_PROGRESS.map((item) => (
                <MacroProgressRow
                  key={item.key}
                  label={item.label}
                  value={macros[item.key] || 0}
                  target={MACRO_TARGETS[item.key]}
                  color={item.color}
                  track={item.track}
                />
              ))}
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
                    ? 'bg-white shadow-[0_6px_16px_rgba(16,24,40,0.10)] border border-[#DCEBFF]'
                    : 'bg-[#F7F7FA] border border-[#ECECF1] active:bg-[#F2F2F7]'
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
