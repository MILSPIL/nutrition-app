import React, { useState, useEffect } from 'react';
import { X, User, Utensils, TrendingDown, TrendingUp, Minus, Ruler, ChevronDown, ChevronLeft, Calendar } from 'lucide-react';
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';

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
    if (diff === null || diff === undefined) return { text: '—', color: 'text-[#C7C7CC]', icon: null };

    if (diff === 0) {
      return { text: '0', color: 'text-[#8E8E93]', icon: <Minus size={14} /> };
    }

    if (diff < 0) {
      return {
        text: `${diff}`,
        color: 'text-[#34C759]',
        icon: <TrendingDown size={14} className="text-[#34C759]" />
      };
    }

    return {
      text: `+${diff}`,
      color: 'text-[#FF3B30]',
      icon: <TrendingUp size={14} className="text-[#FF3B30]" />
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

  // Обробка вибору дати
  const handleDateChange = (e) => {
    // Якщо очищено - повертаємо на сьогодні
    if (!e.target.value) {
      setSelectedDate(new Date());
      return;
    }
    const newDate = new Date(e.target.value + 'T12:00:00');
    setSelectedDate(newDate);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F2F2F7]">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-black/5">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-1 text-[#007AFF] active:opacity-50"
              >
                <ChevronLeft size={24} />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-[#007AFF]/10 rounded-full flex items-center justify-center">
                  <User size={20} className="text-[#007AFF]" />
                </div>
                <div>
                  <h1 className="text-[17px] font-semibold text-black">{client?.name || 'Клієнт'}</h1>
                  <p className="text-[13px] text-[#8E8E93]">{client?.email}</p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-[#8E8E93] active:opacity-50"
            >
              <X size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4">
          {/* Date Picker */}
          <div className="bg-white rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <Calendar size={20} className="text-[#007AFF]" />
              <input
                type="date"
                value={formatDate(selectedDate)}
                onChange={handleDateChange}
                max={formatDate(new Date())}
                className="bg-transparent font-semibold text-black focus:outline-none cursor-pointer text-[17px]"
                style={{ colorScheme: 'light' }}
              />
              {!isToday && (
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="text-[13px] text-[#007AFF] font-medium px-3 py-1 bg-[#007AFF]/10 rounded-full active:opacity-50"
                >
                  ← на сьогодні
                </button>
              )}
            </div>

            {/* Quick dates */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {quickDates.map((date, idx) => {
                const isSelected = formatDate(date) === formatDate(selectedDate);
                const hasData = availableDates.includes(formatDate(date));

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(date)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-medium active:opacity-70 ${
                      isSelected
                        ? 'bg-[#007AFF] text-white'
                        : hasData
                          ? 'bg-[#007AFF]/10 text-[#007AFF]'
                          : 'bg-[#F2F2F7] text-[#C7C7CC]'
                    }`}
                  >
                    {formatShortDate(date)}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#007AFF]"></div>
            </div>
          ) : !dayData ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <Utensils size={48} className="mx-auto text-[#C7C7CC] mb-3" />
              <p className="text-[15px] text-[#8E8E93]">Немає даних за цей день</p>
            </div>
          ) : (
            <>
              {/* Macros Card */}
              <div className="bg-white rounded-2xl p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[15px] text-[#8E8E93]">Білки: </span>
                    <span className={`text-[28px] font-bold ${proteinPercent >= 100 ? 'text-[#34C759]' : 'text-[#007AFF]'}`}>
                      {macros.p}
                    </span>
                    <span className="text-[15px] text-[#C7C7CC]">/{proteinGoal}г</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] text-[#8E8E93]">
                      Ж: {macros.f}г · В: {macros.c}г
                    </div>
                    <div className="text-[17px] font-semibold text-[#FF9500]">
                      {macros.cal} ккал
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-[#F2F2F7] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(proteinPercent, 100)}%`,
                      backgroundColor: proteinPercent >= 100 ? '#34C759' : '#007AFF'
                    }}
                  />
                </div>
                <div className="text-center text-[13px] text-[#8E8E93] mt-1">
                  {proteinPercent}% норми білка
                </div>
              </div>

              {/* Activity & Weight */}
              {(dayData.activity || dayData.currentWeight || dayData.programDay) && (
                <div className="flex gap-3 mb-4 flex-wrap">
                  {dayData.currentWeight && (
                    <div className="bg-white rounded-xl px-4 py-2 flex items-center gap-2">
                      <span className="text-lg">⚖️</span>
                      <span className="text-[15px] font-semibold text-black">{dayData.currentWeight} кг</span>
                    </div>
                  )}
                  {dayData.activity && (
                    <div className="bg-[#5856D6]/10 rounded-xl px-4 py-2">
                      <span className="text-[15px] font-medium text-[#5856D6]">{dayData.activity}</span>
                    </div>
                  )}
                  {dayData.programDay && (
                    <div className="bg-[#007AFF]/10 rounded-xl px-4 py-2">
                      <span className="text-[15px] font-medium text-[#007AFF]">День {dayData.programDay}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Measurements */}
              {measurements.length > 0 && (
                <div className="bg-white rounded-2xl mb-4 overflow-hidden">
                  <button
                    onClick={() => setShowMeasurements(!showMeasurements)}
                    className="w-full flex items-center justify-between p-4 active:bg-[#F2F2F7]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#34C759]/10 rounded-full flex items-center justify-center">
                        <Ruler size={20} className="text-[#34C759]" />
                      </div>
                      <div className="text-left">
                        <div className="text-[15px] font-semibold text-black">Заміри</div>
                        <div className="text-[13px] text-[#8E8E93]">{measurements.length} записів</div>
                      </div>
                    </div>
                    <ChevronDown size={20} className={`text-[#C7C7CC] transition-transform ${showMeasurements ? 'rotate-180' : ''}`} />
                  </button>

                  {showMeasurements && comparisonData && (
                    <div className="border-t border-[#C6C6C8]/30 px-4 pb-4">
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        {MEASUREMENT_PARAMS.map(param => {
                          const initial = comparisonData.initial?.[param.key];
                          const current = comparisonData.current?.[param.key];
                          const totalDiff = calculateDiff(current, initial);
                          const totalFormat = formatDiff(totalDiff);

                          if (initial === undefined && current === undefined) return null;

                          return (
                            <div key={param.key} className="bg-[#F2F2F7] rounded-xl p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[13px] text-[#8E8E93]">{param.icon} {param.label}</span>
                                <span className={`text-[13px] font-semibold flex items-center gap-1 ${totalFormat.color}`}>
                                  {totalFormat.icon}
                                  {totalFormat.text}
                                </span>
                              </div>
                              <div className="text-[13px] text-[#8E8E93]">
                                {initial ?? '-'} → <strong className="text-black">{current ?? '-'}</strong> {param.unit}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Meals */}
              <div className="space-y-3">
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

                  // Підрахунок макросів прийому
                  let mealMacros = { p: 0, f: 0, c: 0, cal: 0 };
                  allProducts.forEach(product => {
                    const multiplier = (product.weight || 100) / 100;
                    mealMacros.p += (product.p || 0) * multiplier;
                    mealMacros.f += (product.f || 0) * multiplier;
                    mealMacros.c += (product.c || 0) * multiplier;
                  });
                  mealMacros.p = Math.round(mealMacros.p * 10) / 10;
                  mealMacros.f = Math.round(mealMacros.f * 10) / 10;
                  mealMacros.c = Math.round(mealMacros.c * 10) / 10;
                  mealMacros.cal = Math.round(mealMacros.p * 4 + mealMacros.c * 4 + mealMacros.f * 9);

                  return (
                    <div key={mealNum} className="bg-white rounded-2xl overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[15px] font-semibold text-black">{MEAL_NAMES[mealNum]}</span>
                          {allProducts.length > 0 && (
                            <span className="text-[13px] text-[#8E8E93]">
                              {mealMacros.p}б · {mealMacros.f}ж · {mealMacros.c}в · {mealMacros.cal} ккал
                            </span>
                          )}
                        </div>

                        {allProducts.length === 0 ? (
                          <p className="text-[#C7C7CC] text-[13px]">Не заповнено</p>
                        ) : (
                          <div className="space-y-2">
                            {allProducts.map((product, idx) => {
                              const multiplier = (product.weight || 100) / 100;
                              const productP = Math.round((product.p || 0) * multiplier * 10) / 10;

                              return (
                                <div key={`${product.letter}-${idx}`} className="flex items-center justify-between py-1 border-b border-[#C6C6C8]/30 last:border-0">
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 bg-[#F2F2F7] rounded text-[11px] flex items-center justify-center text-[#8E8E93] font-medium">
                                      {product.letter}
                                    </span>
                                    <span className="text-[15px] text-black">{product.name}</span>
                                  </div>
                                  <div className="text-[13px] text-[#8E8E93]">
                                    {product.weight}г · {productP}б
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Last update */}
              {dayData.updatedAt && (
                <div className="mt-4 text-center text-[13px] text-[#C7C7CC]">
                  Оновлено: {new Date(dayData.updatedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
