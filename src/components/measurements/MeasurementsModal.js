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
  const formatDiff = (diff) => {
    if (diff === null || diff === undefined) return { text: '—', color: 'text-gray-400', icon: null };

    if (diff === 0) {
      return { text: '0', color: 'text-gray-500', icon: <Minus size={12} /> };
    }

    // Негативне значення - добре (схуднення)
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
      <div className="bg-white rounded-2xl w-full max-h-[85vh] overflow-hidden flex flex-col mx-2">
        {/* Header */}
        <div className="p-3 border-b flex items-center justify-between" style={{ backgroundColor: '#f2f0eb' }}>
          <div className="flex items-center gap-2">
            <Scale size={20} style={{ color: '#638666' }} />
            <h2 className="font-bold" style={{ color: '#364f3a' }}>Заміри</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X size={22} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
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
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
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
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#638666' }}></div>
            </div>
          ) : activeTab === 'new' ? (
            /* Форма нового заміру */
            <div className="space-y-3">
              <div className="text-center text-sm text-gray-500 mb-3">
                📅 {new Date().toLocaleDateString('uk-UA', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </div>

              {MEASUREMENT_PARAMS.map(param => (
                <div key={param.key} className="flex items-center gap-2">
                  <span className="text-lg w-6">{param.icon}</span>
                  <label className="flex-1 text-gray-700 text-sm font-medium">
                    {param.label}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step={param.step}
                      value={formData[param.key]}
                      onChange={(e) => setFormData({
                        ...formData,
                        [param.key]: e.target.value
                      })}
                      className="w-16 px-2 py-1.5 border rounded-lg text-center text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                      placeholder="—"
                    />
                    <span className="text-gray-500 text-xs w-6">{param.unit}</span>
                  </div>
                </div>
              ))}

              <button
                onClick={handleSave}
                disabled={saving || !Object.values(formData).some(v => v !== '')}
                className="w-full py-2.5 text-white rounded-lg font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                style={{ backgroundColor: '#90bd92' }}
              >
                <Save size={16} />
                {saving ? 'Зберігаю...' : 'Зберегти'}
              </button>
            </div>
          ) : (
            /* Історія та порівняння */
            <div className="space-y-3">
              {measurements.length === 0 ? (
                <div className="text-center py-8">
                  <Scale size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm">Ще немає замірів</p>
                  <p className="text-gray-400 text-xs mt-1">Додайте перший замір</p>
                </div>
              ) : (
                <>
                  {/* Компактна таблиця прогресу */}
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#e5e5e5' }}>
                    <div className="px-3 py-2 font-semibold text-white text-sm" style={{ backgroundColor: '#638666' }}>
                      📈 Прогрес
                    </div>

                    {/* Рядки параметрів */}
                    {comparisonData && MEASUREMENT_PARAMS.map(param => {
                      const initial = comparisonData.initial?.[param.key];
                      const current = comparisonData.current?.[param.key];
                      const totalDiff = calculateDiff(current, initial);
                      const totalFormat = formatDiff(totalDiff);

                      // Пропускаємо параметри без даних
                      if (initial === undefined && current === undefined) return null;

                      return (
                        <div
                          key={param.key}
                          className="flex items-center justify-between px-3 py-2 border-t bg-white"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{param.icon}</span>
                            <span className="text-sm text-gray-700">{param.label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-xs text-gray-400">{initial ?? '—'}</span>
                              <span className="text-gray-300 mx-1">→</span>
                              <span className="text-sm font-semibold" style={{ color: '#364f3a' }}>
                                {current ?? '—'}
                              </span>
                            </div>
                            <div className={`flex items-center gap-0.5 min-w-[50px] justify-end ${totalFormat.color}`}>
                              {totalFormat.icon}
                              <span className="text-sm font-medium">{totalFormat.text}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Дати */}
                    {comparisonData && (
                      <div className="px-3 py-2 bg-gray-50 text-xs text-gray-400 flex justify-between border-t">
                        <span>{formatDate(comparisonData.initial?.date)}</span>
                        <span>→</span>
                        <span>{formatDate(comparisonData.current?.date)}</span>
                      </div>
                    )}
                  </div>

                  {/* Список всіх замірів */}
                  <div className="mt-4">
                    <h3 className="font-semibold text-gray-700 text-sm mb-2">Всі заміри</h3>
                    <div className="space-y-2">
                      {[...measurements].reverse().map(measurement => (
                        <div
                          key={measurement.id}
                          className="bg-gray-50 rounded-lg p-2.5"
                        >
                          <div className="text-sm font-medium text-gray-700 mb-1.5">
                            {new Date(measurement.date).toLocaleDateString('uk-UA', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                            {MEASUREMENT_PARAMS.map(param => {
                              const value = measurement[param.key];
                              if (value === undefined) return null;
                              return (
                                <span key={param.key}>
                                  {param.icon} {value}
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
