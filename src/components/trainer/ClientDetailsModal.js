import React, { useState, useEffect } from 'react';
import { X, User, Calendar, ChevronLeft, ChevronRight, Activity, Scale, Utensils, TrendingDown, TrendingUp, Minus, Ruler } from 'lucide-react';
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

  // Навігація по датах
  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    if (newDate <= new Date()) {
      setSelectedDate(newDate);
    }
  };

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

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <User size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800">{client?.name || 'Клієнт'}</h2>
              <p className="text-xs text-gray-500">{client?.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Date Navigation */}
        <div className="p-3 border-b flex items-center justify-between bg-white">
          <button
            onClick={goToPreviousDay}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} className="text-gray-600" />
          </button>

          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-500" />
            <span className="font-medium text-gray-800">
              {selectedDate.toLocaleDateString('uk-UA', {
                weekday: 'short',
                day: 'numeric',
                month: 'long'
              })}
            </span>
            {isToday && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                Сьогодні
              </span>
            )}
          </div>

          <button
            onClick={goToNextDay}
            disabled={isToday}
            className={`p-2 rounded-lg transition-colors ${
              isToday ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100'
            }`}
          >
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : !dayData ? (
            <div className="text-center py-12">
              <Utensils size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Немає даних за цю дату</p>
            </div>
          ) : (
            <>
              {/* Macros Summary */}
              <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-gray-800">Макроси за день</span>
                  {dayData.programDay && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      День {dayData.programDay}
                    </span>
                  )}
                </div>

                {/* Protein Progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">Білки</span>
                    <span className="font-medium">
                      {macros.p}г / {proteinGoal}г ({proteinPercent}%)
                    </span>
                  </div>
                  <div className="h-3 bg-white rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(proteinPercent, 100)}%`,
                        backgroundColor: proteinPercent >= 100 ? '#22c55e' : '#3b82f6'
                      }}
                    />
                  </div>
                </div>

                {/* Other macros */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white rounded-lg p-2">
                    <div className="text-lg font-bold text-gray-800">{macros.f}г</div>
                    <div className="text-xs text-gray-500">Жири</div>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <div className="text-lg font-bold text-gray-800">{macros.c}г</div>
                    <div className="text-xs text-gray-500">Вуглеводи</div>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <div className="text-lg font-bold text-orange-600">{macros.cal}</div>
                    <div className="text-xs text-gray-500">ккал</div>
                  </div>
                </div>
              </div>

              {/* Activity & Weight */}
              {(dayData.activity || dayData.currentWeight) && (
                <div className="flex gap-3 mb-4">
                  {dayData.activity && (
                    <div className="flex-1 bg-purple-50 rounded-lg p-3 flex items-center gap-2">
                      <Activity size={18} className="text-purple-600" />
                      <div>
                        <div className="text-xs text-gray-500">Активність</div>
                        <div className="font-medium text-gray-800">{dayData.activity}</div>
                        {dayData.otherActivity && (
                          <div className="text-xs text-gray-600">{dayData.otherActivity}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {dayData.currentWeight && (
                    <div className="flex-1 bg-blue-50 rounded-lg p-3 flex items-center gap-2">
                      <Scale size={18} className="text-blue-600" />
                      <div>
                        <div className="text-xs text-gray-500">Вага</div>
                        <div className="font-medium text-gray-800">{dayData.currentWeight} кг</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Measurements Section */}
              {measurements.length > 0 && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowMeasurements(!showMeasurements)}
                    className="w-full flex items-center justify-between p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Ruler size={18} className="text-green-600" />
                      <span className="font-medium text-gray-800">Заміри клієнта</span>
                      <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">
                        {measurements.length} записів
                      </span>
                    </div>
                    <ChevronRight
                      size={18}
                      className={`text-gray-400 transition-transform ${showMeasurements ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {showMeasurements && comparisonData && (
                    <div className="mt-3 border rounded-lg overflow-hidden">
                      <div className="bg-green-600 text-white p-2 text-sm font-medium">
                        📈 Прогрес замірів
                      </div>

                      {/* Table Header */}
                      <div className="grid grid-cols-6 gap-1 p-2 bg-gray-50 text-xs font-medium text-gray-500">
                        <div>Параметр</div>
                        <div className="text-center">Початок</div>
                        <div className="text-center">Минулий</div>
                        <div className="text-center">Зараз</div>
                        <div className="text-center">Тиждень</div>
                        <div className="text-center">Загалом</div>
                      </div>

                      {/* Table Rows */}
                      {MEASUREMENT_PARAMS.map(param => {
                        const initial = comparisonData.initial?.[param.key];
                        const previous = comparisonData.previous?.[param.key];
                        const current = comparisonData.current?.[param.key];

                        const weekDiff = calculateDiff(current, previous);
                        const totalDiff = calculateDiff(current, initial);

                        const weekFormat = formatDiff(weekDiff);
                        const totalFormat = formatDiff(totalDiff);

                        if (initial === undefined && current === undefined) return null;

                        return (
                          <div
                            key={param.key}
                            className="grid grid-cols-6 gap-1 p-2 border-t text-xs items-center"
                          >
                            <div className="font-medium text-gray-700 flex items-center gap-1">
                              <span>{param.icon}</span>
                              <span>{param.label}</span>
                            </div>
                            <div className="text-center text-gray-600">
                              {initial !== undefined ? initial : '—'}
                            </div>
                            <div className="text-center text-gray-600">
                              {previous !== undefined ? previous : '—'}
                            </div>
                            <div className="text-center font-semibold text-gray-800">
                              {current !== undefined ? current : '—'}
                            </div>
                            <div className={`text-center flex items-center justify-center gap-0.5 ${weekFormat.color}`}>
                              {weekFormat.icon}
                              <span>{weekFormat.text}</span>
                            </div>
                            <div className={`text-center flex items-center justify-center gap-0.5 ${totalFormat.color}`}>
                              {totalFormat.icon}
                              <span>{totalFormat.text}</span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Dates */}
                      <div className="p-2 bg-gray-50 text-xs text-gray-400 flex justify-between">
                        <span>Початок: {comparisonData.initial?.date ? new Date(comparisonData.initial.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : '—'}</span>
                        <span>Зараз: {comparisonData.current?.date ? new Date(comparisonData.current.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : '—'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Meals */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Utensils size={18} />
                  Прийоми їжі
                </h3>

                {[1, 2, 3, 4].map(mealNum => {
                  const mealData = dayData.meals?.[mealNum] || {};
                  // mealData має формат: { "Б": [products], "В": [products], ... }
                  const letterEntries = Object.entries(mealData);

                  // Зібрати всі продукти з усіх літер
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
                      <div key={mealNum} className="bg-gray-50 rounded-lg p-3">
                        <div className="font-medium text-gray-400">{MEAL_NAMES[mealNum]}</div>
                        <div className="text-sm text-gray-400">—</div>
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
                  mealMacros.f = Math.round(mealMacros.f * 10) / 10;
                  mealMacros.c = Math.round(mealMacros.c * 10) / 10;
                  mealMacros.cal = Math.round(mealMacros.p * 4 + mealMacros.c * 4 + mealMacros.f * 9);

                  return (
                    <div key={mealNum} className="bg-white border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-800">{MEAL_NAMES[mealNum]}</span>
                        <span className="text-xs text-gray-500">
                          Б: {mealMacros.p}г · Ж: {mealMacros.f}г · В: {mealMacros.c}г · {mealMacros.cal} ккал
                        </span>
                      </div>
                      <div className="space-y-1">
                        {allProducts.map((product, idx) => (
                          <div key={`${product.letter}-${idx}`} className="flex justify-between text-sm">
                            <span className="text-gray-600">
                              <span className="text-gray-400 mr-1">{product.letter})</span>
                              {product.name}
                              <span className="text-gray-400 ml-1">
                                ({product.weight}г)
                              </span>
                            </span>
                            <span className="text-gray-400 text-xs">
                              {Math.round(product.p * product.weight / 100 * 10) / 10}б ·
                              {Math.round(product.f * product.weight / 100 * 10) / 10}ж ·
                              {Math.round(product.c * product.weight / 100 * 10) / 10}в
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Last update */}
              {dayData.updatedAt && (
                <div className="mt-4 text-center text-xs text-gray-400">
                  Оновлено: {new Date(dayData.updatedAt).toLocaleString('uk-UA')}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AnimatedModal>
  );
}
