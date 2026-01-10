import React, { useState, useEffect } from 'react';
import { X, User, Utensils, TrendingDown, TrendingUp, Minus, Ruler, ChevronDown } from 'lucide-react';
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import AnimatedModal from '../AnimatedModal';

// Параметри замірів
const MEASUREMENT_PARAMS = [
  { key: 'weight', label: 'Вага', unit: 'кг', icon: '⚖️' },
  { key: 'waist', label: 'Талія', unit: 'см', icon: '📏' },
  { key: 'hips', label: 'Стегна', unit: 'см', icon: '📏' },
  { key: 'chest', label: 'Груди', unit: 'см', icon: '📏' },
  { key: 'arms', label: 'Руки', unit: 'см', icon: '💪' },
  { key: 'thighs', label: 'Ноги', unit: 'см', icon: '🦵' },
];

// Назви прийомів їжі
const MEAL_NAMES = {
  1: 'Сніданок',
  2: 'Обід',
  3: 'Вечеря',
  4: 'Перекус'
};

export default function ClientDetailsModal({ isOpen, onClose, client, todayMeals }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dayData, setDayData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [availableDates, setAvailableDates] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [showMeasurements, setShowMeasurements] = useState(false);

  // Форматування дати
  const formatDate = (date) => date.toISOString().split('T')[0];

  // Перевірка чи це сьогодні
  const isToday = formatDate(selectedDate) === formatDate(new Date());

  // Завантажити доступні дати та заміри
  useEffect(() => {
    if (!isOpen || !client?.id) return;

    const loadAvailableDates = async () => {
      try {
        const historyRef = collection(db, 'users', client.id, 'mealHistory');
        const q = query(historyRef, orderBy('updatedAt', 'desc'), limit(30));
        const snapshot = await getDocs(q);

        const dates = snapshot.docs.map(doc => doc.id);
        setAvailableDates(dates);
      } catch (error) {
        console.error('Error loading available dates:', error);
      }
    };

    const loadMeasurements = async () => {
      try {
        const measurementsRef = collection(db, 'users', client.id, 'measurements');
        const q = query(measurementsRef, orderBy('date', 'asc'));
        const snapshot = await getDocs(q);

        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMeasurements(data);
      } catch (error) {
        console.error('Error loading measurements:', error);
      }
    };

    loadAvailableDates();
    loadMeasurements();
  }, [isOpen, client?.id]);

  // Завантажити дані за обрану дату
  useEffect(() => {
    if (!isOpen || !client?.id) return;

    const loadDayData = async () => {
      const dateStr = formatDate(selectedDate);

      // Якщо сьогодні - використовуємо передані дані
      if (isToday && todayMeals) {
        setDayData(todayMeals);
        return;
      }

      setLoading(true);
      try {
        const historyRef = doc(db, 'users', client.id, 'mealHistory', dateStr);
        const historyDoc = await getDoc(historyRef);

        if (historyDoc.exists()) {
          setDayData(historyDoc.data());
        } else {
          setDayData(null);
        }
      } catch (error) {
        console.error('Error loading day data:', error);
        setDayData(null);
      } finally {
        setLoading(false);
      }
    };

    loadDayData();
  }, [isOpen, client?.id, selectedDate, isToday, todayMeals]);

  // Оновити дані коли змінюються todayMeals
  useEffect(() => {
    if (isToday && todayMeals) {
      setDayData(todayMeals);
    }
  }, [todayMeals, isToday]);

  // Підрахувати макроси
  const macros = dayData?.totalMacros || { p: 0, f: 0, c: 0, cal: 0 };
  const proteinGoal = 140;
  const proteinPercent = Math.round((macros.p / proteinGoal) * 100);

  // Функції для роботи із замірами
  const calculateDiff = (current, previous) => {
    if (current === undefined || previous === undefined) return null;
    return Math.round((current - previous) * 10) / 10;
  };

  const formatDiff = (diff) => {
    if (diff === null || diff === undefined) return { text: '—', color: 'text-gray-400', icon: null };

    if (diff === 0) {
      return { text: '0', color: 'text-gray-500', icon: <Minus size={12} /> };
    }

    if (diff < 0) {
      return {
        text: `${diff}`,
        color: 'text-green-600',
        icon: <TrendingDown size={12} className="text-green-600" />
      };
    }

    return {
      text: `+${diff}`,
      color: 'text-red-500',
      icon: <TrendingUp size={12} className="text-red-500" />
    };
  };

  const getComparisonData = () => {
    if (measurements.length === 0) return null;

    const initial = measurements[0];
    const previous = measurements.length > 1 ? measurements[measurements.length - 2] : null;
    const current = measurements[measurements.length - 1];

    return { initial, previous, current };
  };

  const comparisonData = getComparisonData();

  // Генерувати останні 7 днів для швидкого вибору
  const getQuickDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date);
    }
    return dates;
  };

  const quickDates = getQuickDates();

  // Форматування короткої дати
  const formatShortDate = (date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (formatDate(date) === formatDate(today)) return 'Сьогодні';
    if (formatDate(date) === formatDate(yesterday)) return 'Вчора';

    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-h-[80vh] overflow-hidden flex flex-col mx-1">
        {/* Header - Ultra Compact */}
        <div className="px-2 py-1.5 border-b flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
              <User size={12} className="text-blue-600" />
            </div>
            <span className="font-semibold text-gray-800 text-xs">{client?.name || 'Клієнт'}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-0.5">
            <X size={18} />
          </button>
        </div>

        {/* Date Picker - Ultra Compact */}
        <div className="px-1.5 py-1 border-b bg-white">
          <div className="flex gap-0.5 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {quickDates.map((date, idx) => {
              const isSelected = formatDate(date) === formatDate(selectedDate);
              const hasData = availableDates.includes(formatDate(date));

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(date)}
                  className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : hasData
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {formatShortDate(date)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            </div>
          ) : !dayData ? (
            <div className="text-center py-4">
              <Utensils size={24} className="mx-auto text-gray-300 mb-1" />
              <p className="text-gray-500 text-[10px]">Немає даних</p>
            </div>
          ) : (
            <>
              {/* Macros - Ultra Compact - One row */}
              <div className="bg-blue-50 rounded-lg p-1.5 mb-1.5">
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-gray-600">Б: <strong className={proteinPercent >= 100 ? 'text-green-600' : 'text-blue-600'}>{macros.p}</strong>/{proteinGoal}г</span>
                  <span className="text-gray-500">Ж:{macros.f} В:{macros.c}</span>
                  <span className="text-orange-500">{macros.cal}ккал</span>
                  {dayData.programDay && <span className="text-blue-600">Д{dayData.programDay}</span>}
                </div>
                <div className="h-1 bg-white rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(proteinPercent, 100)}%`,
                      backgroundColor: proteinPercent >= 100 ? '#22c55e' : '#3b82f6'
                    }}
                  />
                </div>
              </div>

              {/* Activity & Weight - One line, smaller */}
              {(dayData.activity || dayData.currentWeight) && (
                <div className="flex gap-1 mb-1.5 text-[10px]">
                  {dayData.currentWeight && (
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded-full">⚖️{dayData.currentWeight}кг</span>
                  )}
                  {dayData.activity && (
                    <span className="bg-purple-50 px-1.5 py-0.5 rounded-full text-purple-700">{dayData.activity}</span>
                  )}
                </div>
              )}

              {/* Measurements - Ultra Compact */}
              {measurements.length > 0 && (
                <div className="mb-1.5">
                  <button
                    onClick={() => setShowMeasurements(!showMeasurements)}
                    className="w-full flex items-center justify-between p-1.5 bg-green-50 rounded-lg"
                  >
                    <div className="flex items-center gap-1">
                      <Ruler size={12} className="text-green-600" />
                      <span className="font-medium text-gray-700 text-[10px]">Заміри</span>
                      <span className="text-[9px] bg-green-200 text-green-700 px-1 rounded-full">{measurements.length}</span>
                    </div>
                    <ChevronDown size={12} className={`text-gray-400 transition-transform ${showMeasurements ? 'rotate-180' : ''}`} />
                  </button>

                  {showMeasurements && comparisonData && (
                    <div className="mt-1 grid grid-cols-2 gap-0.5">
                      {MEASUREMENT_PARAMS.map(param => {
                        const initial = comparisonData.initial?.[param.key];
                        const current = comparisonData.current?.[param.key];
                        const totalDiff = calculateDiff(current, initial);
                        const totalFormat = formatDiff(totalDiff);

                        if (initial === undefined && current === undefined) return null;

                        return (
                          <div key={param.key} className="flex items-center justify-between px-1.5 py-0.5 bg-white border rounded text-[10px]">
                            <span className="text-gray-500">{param.icon}{param.label.slice(0, 3)}</span>
                            <span className="text-gray-400">{initial ?? '-'}→<strong>{current ?? '-'}</strong></span>
                            <span className={`font-medium ${totalFormat.color}`}>{totalFormat.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Meals - Ultra Compact */}
              <div className="space-y-1">
                {[1, 2, 3, 4].map(mealNum => {
                  const mealData = dayData.meals?.[mealNum] || {};
                  const letterEntries = Object.entries(mealData);

                  const allProducts = [];
                  letterEntries.forEach(([letter, products]) => {
                    if (Array.isArray(products)) {
                      products.forEach((product, idx) => {
                        allProducts.push({ ...product, letter, idx });
                      });
                    }
                  });

                  if (allProducts.length === 0) {
                    return (
                      <div key={mealNum} className="bg-gray-50 rounded px-1.5 py-0.5">
                        <span className="text-[10px] text-gray-400">{MEAL_NAMES[mealNum]}: —</span>
                      </div>
                    );
                  }

                  // Підрахунок макросів прийому
                  let mealMacros = { p: 0, f: 0, c: 0, cal: 0 };
                  allProducts.forEach(product => {
                    const multiplier = (product.weight || 100) / 100;
                    mealMacros.p += (product.p || 0) * multiplier;
                    mealMacros.f += (product.f || 0) * multiplier;
                    mealMacros.c += (product.c || 0) * multiplier;
                  });
                  mealMacros.p = Math.round(mealMacros.p * 10) / 10;
                  mealMacros.cal = Math.round(mealMacros.p * 4 + mealMacros.c * 4 + mealMacros.f * 9);

                  return (
                    <div key={mealNum} className="bg-white border rounded px-1.5 py-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800 text-[11px]">{MEAL_NAMES[mealNum]}</span>
                        <span className="text-[10px] text-gray-400">{mealMacros.p}б·{mealMacros.cal}ккал</span>
                      </div>
                      <div className="text-[10px] text-gray-600 truncate">
                        {allProducts.map((product, idx) => (
                          <span key={`${product.letter}-${idx}`}>
                            {idx > 0 && ', '}
                            {product.name}({product.weight}г)
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Last update */}
              {dayData.updatedAt && (
                <div className="mt-1 text-center text-[9px] text-gray-400">
                  {new Date(dayData.updatedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AnimatedModal>
  );
}
