import React, { useState } from 'react';
import { Check, X, Settings, Users, Calendar, ChevronDown, LogOut } from 'lucide-react';
import { PROFILE_ICONS, MEAL_BADGE_ICONS } from '../data/products';

export default function Header({
  user,
  currentUser,
  programDay,
  currentWeight,
  macros,
  selectedMeal,
  onSignOut,
  onWeightChange,
  onNameChange,
  onMealSelect,
  onShowAccountSwitch,
  onShowStartDateSetup,
  onShowPortionSettings,
  onShowDaySelector
}) {
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [tempWeight, setTempWeight] = useState(currentWeight);

  const proteinPercent = Math.round((macros.p / 140) * 100);

  return (
    <div className="max-w-4xl mx-auto mb-6 bg-white rounded-lg shadow p-4">
      {/* Верхній рядок: ім'я + вага + вихід */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <img
            src={PROFILE_ICONS[user?.gender] || PROFILE_ICONS["чоловік"]}
            alt="Профіль"
            className="w-8 h-8 object-cover rounded-full shadow-sm"
          />
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={editingNameValue}
                onChange={(e) => setEditingNameValue(e.target.value)}
                className="px-2 py-1 border rounded text-sm w-32"
                autoFocus
              />
              <button
                onClick={() => {
                  if (editingNameValue.trim()) {
                    onNameChange(editingNameValue.trim());
                  }
                  setIsEditingName(false);
                }}
                className="text-green-600"
              >
                <Check size={16} />
              </button>
              <button onClick={() => setIsEditingName(false)} className="text-gray-400">
                <X size={16} />
              </button>
            </div>
          ) : (
            <span
              className="font-semibold cursor-pointer hover:text-green-700"
              onClick={() => {
                setEditingNameValue(user?.name || "");
                setIsEditingName(true);
              }}
            >
              {user?.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isEditingWeight ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.1"
                value={tempWeight || ""}
                onChange={(e) => setTempWeight(e.target.value ? parseFloat(e.target.value) : null)}
                className="w-14 px-1 py-1 border rounded text-xs text-center"
                placeholder="кг"
                autoFocus
              />
              <button onClick={() => {
                onWeightChange(tempWeight);
                setIsEditingWeight(false);
              }} className="text-green-600">
                <Check size={14} />
              </button>
            </div>
          ) : (
            <span
              className="text-xs cursor-pointer hover:text-green-700"
              style={{ color: '#638666' }}
              onClick={() => {
                setTempWeight(currentWeight);
                setIsEditingWeight(true);
              }}
            >
              {currentWeight ? `⚖️ ${currentWeight} кг` : '⚖️ Вага'}
            </span>
          )}
          <button
            onClick={onSignOut}
            className="text-xs text-gray-400 hover:text-red-600"
            title="Вийти"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* Другий рядок: День + налаштування */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">День</span>
          <span className="text-2xl font-bold" style={{ color: '#638666' }}>{programDay}</span>
          <button
            onClick={onShowDaySelector}
            className="text-gray-400 hover:text-gray-600"
            title="Вибрати інший день"
          >
            <ChevronDown size={16} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={onShowAccountSwitch} className="p-1.5 hover:bg-gray-100 rounded-full" title="Змінити акаунт">
            <Users size={16} className="text-gray-500" />
          </button>
          <button
            onClick={onShowStartDateSetup}
            className="p-1.5 hover:bg-gray-100 rounded-full"
            title="Налаштування дати початку"
          >
            <Calendar size={16} className="text-gray-500" />
          </button>
          <button onClick={onShowPortionSettings} className="p-1.5 hover:bg-gray-100 rounded-full" title="Налаштування порцій">
            <Settings size={16} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Показник БЖВ */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-700 mb-1">🍖 Білки за день:</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold" style={{ color: proteinPercent >= 100 ? '#22c55e' : '#ef4444' }}>
                {macros.p}г
              </span>
              <span className="text-sm text-gray-600">/ 140г</span>
              <span className={`text-sm font-semibold ${proteinPercent >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                ({proteinPercent}%)
              </span>
            </div>
          </div>

          <div className="text-right text-xs text-gray-600">
            <div>Ж: {macros.f}г / 70г</div>
            <div>В: {macros.c}г / 235г</div>
          </div>
        </div>
      </div>

      {/* Вибір прийому їжі */}
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map(num => (
          <button
            key={num}
            onClick={() => onMealSelect(num)}
            className={`aspect-square rounded-lg flex items-center justify-center p-2 ${
              selectedMeal === num ? 'border-4 border-black' : 'border-2 border-transparent'
            }`}
            style={{ backgroundColor: '#f2f0eb' }}
          >
            <img src={MEAL_BADGE_ICONS[num]} alt={`Прийом ${num}`} className="w-full h-full object-contain" />
          </button>
        ))}
      </div>
    </div>
  );
}
