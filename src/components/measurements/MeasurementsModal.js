import React, { useState, useEffect } from 'react';
import { X, Scale, Plus, TrendingDown, TrendingUp, Minus, Save, History } from 'lucide-react';
import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import AnimatedModal from '../AnimatedModal';

// Параметри замірів
const MEASUREMENT_PARAMS = [
  { key: 'weight', label: 'Вага', unit: 'кг', step: 0.1, icon: '⚖️' },
  { key: 'waist', label: 'Талія', unit: 'см', step: 1, icon: '📏' },
  { key: 'hips', label: 'Стегна', unit: 'см', step: 1, icon: '📏' },
  { key: 'chest', label: 'Груди', unit: 'см', step: 1, icon: '📏' },
  { key: 'arms', label: 'Руки', unit: 'см', step: 1, icon: '💪' },
  { key: 'thighs', label: 'Ноги', unit: 'см', step: 1, icon: '🦵' },
];

export default function MeasurementsModal({ isOpen, onClose, firebaseUser }) {
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    weight: '',
    waist: '',
    hips: '',
    chest: '',
    arms: '',
    thighs: '',
  });

  // Завантажити заміри
  useEffect(() => {
    if (!isOpen || !firebaseUser) return;

    const loadMeasurements = async () => {
      setLoading(true);
      try {
        const measurementsRef = collection(db, 'users', firebaseUser.uid, 'measurements');
        const q = query(measurementsRef, orderBy('date', 'asc'));
        const snapshot = await getDocs(q);

        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMeasurements(data);
      } catch (error) {
        console.error('Error loading measurements:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMeasurements();
  }, [isOpen, firebaseUser]);

  // Зберегти заміри
  const handleSave = async () => {
    if (!firebaseUser) return;

    // Перевірити чи є хоча б одне значення
    const hasValue = Object.values(formData).some(v => v !== '' && v !== null);
    if (!hasValue) return;

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const measurementRef = doc(db, 'users', firebaseUser.uid, 'measurements', today);

      const dataToSave = {
        date: today,
        timestamp: new Date().toISOString(),
      };

      // Додаємо тільки заповнені поля
      MEASUREMENT_PARAMS.forEach(param => {
        const value = formData[param.key];
        if (value !== '' && value !== null) {
          dataToSave[param.key] = parseFloat(value);
        }
      });

      await setDoc(measurementRef, dataToSave, { merge: true });

      // Оновити локальний список
      const existingIndex = measurements.findIndex(m => m.id === today);
      if (existingIndex >= 0) {
        const updated = [...measurements];
        updated[existingIndex] = { id: today, ...dataToSave };
        setMeasurements(updated);
      } else {
        setMeasurements([...measurements, { id: today, ...dataToSave }]);
      }

      // Очистити форму
      setFormData({
        weight: '',
        waist: '',
        hips: '',
        chest: '',
        arms: '',
        thighs: '',
      });

      // Перейти на вкладку історії
      setActiveTab('history');
    } catch (error) {
      console.error('Error saving measurements:', error);
    } finally {
      setSaving(false);
    }
  };

  // Розрахунок різниці
  const calculateDiff = (current, previous) => {
    if (current === undefined || previous === undefined) return null;
    return Math.round((current - previous) * 10) / 10;
  };

  // Форматування різниці
  const formatDiff = (diff, inverted = true) => {
    if (diff === null || diff === undefined) return { text: '—', color: 'text-gray-400', icon: null };

    // inverted = true означає, що негативне значення - це добре (схуднення)
    const isPositiveResult = inverted ? diff < 0 : diff > 0;

    if (diff === 0) {
      return { text: '0', color: 'text-gray-500', icon: <Minus size={14} /> };
    }

    if (isPositiveResult) {
      return {
        text: `${diff > 0 ? '+' : ''}${diff}`,
        color: 'text-green-600',
        icon: <TrendingDown size={14} className="text-green-600" />
      };
    }

    return {
      text: `${diff > 0 ? '+' : ''}${diff}`,
      color: 'text-red-500',
      icon: <TrendingUp size={14} className="text-red-500" />
    };
  };

  // Отримати дані для таблиці порівняння
  const getComparisonData = () => {
    if (measurements.length === 0) return null;

    const initial = measurements[0];
    const previous = measurements.length > 1 ? measurements[measurements.length - 2] : null;
    const current = measurements[measurements.length - 1];

    return { initial, previous, current };
  };

  const comparisonData = getComparisonData();

  // Форматування дати
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between" style={{ backgroundColor: '#f2f0eb' }}>
          <div className="flex items-center gap-2">
            <Scale size={24} style={{ color: '#638666' }} />
            <h2 className="font-bold text-lg" style={{ color: '#364f3a' }}>Заміри</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'new'
                ? 'text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            style={activeTab === 'new' ? { backgroundColor: '#638666' } : {}}
          >
            <Plus size={16} />
            Новий замір
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'history'
                ? 'text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            style={activeTab === 'history' ? { backgroundColor: '#638666' } : {}}
          >
            <History size={16} />
            Історія
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#638666' }}></div>
            </div>
          ) : activeTab === 'new' ? (
            /* Форма нового заміру */
            <div className="space-y-4">
              <div className="text-center text-sm text-gray-500 mb-4">
                📅 {new Date().toLocaleDateString('uk-UA', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </div>

              {MEASUREMENT_PARAMS.map(param => (
                <div key={param.key} className="flex items-center gap-3">
                  <span className="text-xl w-8">{param.icon}</span>
                  <label className="flex-1 text-gray-700 font-medium">
                    {param.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step={param.step}
                      value={formData[param.key]}
                      onChange={(e) => setFormData({
                        ...formData,
                        [param.key]: e.target.value
                      })}
                      className="w-20 px-3 py-2 border rounded-lg text-center focus:outline-none focus:ring-2"
                      style={{ focusRing: '#90bd92' }}
                      placeholder="—"
                    />
                    <span className="text-gray-500 text-sm w-8">{param.unit}</span>
                  </div>
                </div>
              ))}

              <button
                onClick={handleSave}
                disabled={saving || !Object.values(formData).some(v => v !== '')}
                className="w-full py-3 text-white rounded-lg font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                style={{ backgroundColor: '#90bd92' }}
              >
                <Save size={18} />
                {saving ? 'Зберігаю...' : 'Зберегти заміри'}
              </button>
            </div>
          ) : (
            /* Історія та порівняння */
            <div className="space-y-4">
              {measurements.length === 0 ? (
                <div className="text-center py-12">
                  <Scale size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">Ще немає замірів</p>
                  <p className="text-gray-400 text-sm mt-1">Додайте перший замір</p>
                </div>
              ) : (
                <>
                  {/* Таблиця порівняння */}
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#e5e5e5' }}>
                    <div className="p-3 font-semibold text-white" style={{ backgroundColor: '#638666' }}>
                      📈 Прогрес
                    </div>

                    {/* Заголовок таблиці */}
                    <div className="grid grid-cols-6 gap-1 p-2 bg-gray-50 text-xs font-medium text-gray-600">
                      <div className="col-span-1">Параметр</div>
                      <div className="text-center">Початок</div>
                      <div className="text-center">Минулий</div>
                      <div className="text-center">Зараз</div>
                      <div className="text-center">Тиждень</div>
                      <div className="text-center">Загалом</div>
                    </div>

                    {/* Рядки таблиці */}
                    {comparisonData && MEASUREMENT_PARAMS.map(param => {
                      const initial = comparisonData.initial?.[param.key];
                      const previous = comparisonData.previous?.[param.key];
                      const current = comparisonData.current?.[param.key];

                      const weekDiff = calculateDiff(current, previous);
                      const totalDiff = calculateDiff(current, initial);

                      const weekFormat = formatDiff(weekDiff);
                      const totalFormat = formatDiff(totalDiff);

                      // Пропускаємо параметри без даних
                      if (initial === undefined && current === undefined) return null;

                      return (
                        <div
                          key={param.key}
                          className="grid grid-cols-6 gap-1 p-2 border-t text-sm items-center"
                        >
                          <div className="col-span-1 font-medium text-gray-700 flex items-center gap-1">
                            <span className="text-sm">{param.icon}</span>
                            <span className="text-xs">{param.label}</span>
                          </div>
                          <div className="text-center text-gray-600 text-xs">
                            {initial !== undefined ? `${initial}` : '—'}
                          </div>
                          <div className="text-center text-gray-600 text-xs">
                            {previous !== undefined ? `${previous}` : '—'}
                          </div>
                          <div className="text-center font-semibold text-xs" style={{ color: '#364f3a' }}>
                            {current !== undefined ? `${current}` : '—'}
                          </div>
                          <div className={`text-center text-xs flex items-center justify-center gap-0.5 ${weekFormat.color}`}>
                            {weekFormat.icon}
                            <span>{weekFormat.text}</span>
                          </div>
                          <div className={`text-center text-xs flex items-center justify-center gap-0.5 ${totalFormat.color}`}>
                            {totalFormat.icon}
                            <span>{totalFormat.text}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Дати замірів */}
                  {comparisonData && (
                    <div className="flex justify-between text-xs text-gray-400 px-2">
                      <span>Початок: {formatDate(comparisonData.initial?.date)}</span>
                      {comparisonData.previous && (
                        <span>Минулий: {formatDate(comparisonData.previous?.date)}</span>
                      )}
                      <span>Зараз: {formatDate(comparisonData.current?.date)}</span>
                    </div>
                  )}

                  {/* Список всіх замірів */}
                  <div className="mt-6">
                    <h3 className="font-semibold text-gray-700 mb-3">Всі заміри</h3>
                    <div className="space-y-2">
                      {[...measurements].reverse().map(measurement => (
                        <div
                          key={measurement.id}
                          className="bg-gray-50 rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-700">
                              {new Date(measurement.date).toLocaleDateString('uk-UA', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            {MEASUREMENT_PARAMS.map(param => {
                              const value = measurement[param.key];
                              if (value === undefined) return null;
                              return (
                                <span key={param.key}>
                                  {param.icon} {value} {param.unit}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AnimatedModal>
  );
}
