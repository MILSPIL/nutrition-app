import React, { useState, useEffect } from 'react';
import { X, Scale, Plus, TrendingDown, TrendingUp, Minus, Save, History } from 'lucide-react';
import { doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import AnimatedModal from '../AnimatedModal';
import {
  calculateMeasurementDiff,
  getMeasurementComparison,
  MEASUREMENT_PARAMS
} from '../../services/measurements';
import { getTodayDateKey } from '../../utils/date';

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
      const today = getTodayDateKey();
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

  // Форматування різниці
  const formatDiff = (diff) => {
    if (diff === null || diff === undefined) return { text: 'Немає', color: 'text-[#C7C7CC]', icon: null };

    if (diff === 0) {
      return { text: '0', color: 'text-[#8E8E93]', icon: <Minus size={12} /> };
    }

    // Негативне значення - добре (схуднення)
    if (diff < 0) {
      return {
        text: `${diff}`,
        color: 'text-[#34C759]',
        icon: <TrendingDown size={12} className="text-[#34C759]" />
      };
    }

    return {
      text: `+${diff}`,
      color: 'text-[#FF3B30]',
      icon: <TrendingUp size={12} className="text-[#FF3B30]" />
    };
  };

  const comparisonData = getMeasurementComparison(measurements);

  // Форматування дати
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Немає';
    const date = new Date(dateStr);
    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#C6C6C8]/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale size={20} className="text-[#007AFF]" />
            <h2 className="text-[17px] font-semibold text-black">Заміри</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#007AFF] active:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-2 bg-[#F2F2F7]">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 py-2 text-[15px] font-medium flex items-center justify-center gap-1.5 rounded-lg transition-all ${
              activeTab === 'new'
                ? 'bg-white text-[#007AFF] shadow-sm'
                : 'text-[#8E8E93] active:bg-white/50'
            }`}
          >
            <Plus size={16} />
            Новий
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 text-[15px] font-medium flex items-center justify-center gap-1.5 rounded-lg transition-all ${
              activeTab === 'history'
                ? 'bg-white text-[#007AFF] shadow-sm'
                : 'text-[#8E8E93] active:bg-white/50'
            }`}
          >
            <History size={16} />
            Історія
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#F2F2F7]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#007AFF]"></div>
            </div>
          ) : activeTab === 'new' ? (
            /* Форма нового заміру */
            <div className="space-y-3">
              <div className="text-center text-[13px] text-[#8E8E93] mb-4">
                {new Date().toLocaleDateString('uk-UA', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </div>

              <div className="bg-white rounded-xl overflow-hidden">
                {MEASUREMENT_PARAMS.map((param, idx) => (
                  <div
                    key={param.key}
                    className={`flex items-center justify-between px-4 py-3 ${
                      idx < MEASUREMENT_PARAMS.length - 1 ? 'border-b border-[#C6C6C8]/30' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{param.icon}</span>
                      <label className="text-[15px] text-black">
                        {param.label}
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step={param.step}
                        value={formData[param.key]}
                        onChange={(e) => setFormData({
                          ...formData,
                          [param.key]: e.target.value
                        })}
                        className="w-20 px-3 py-1.5 bg-[#F2F2F7] rounded-lg text-center text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                        placeholder="0"
                      />
                      <span className="text-[13px] text-[#8E8E93] w-6">{param.unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !Object.values(formData).some(v => v !== '')}
                className="w-full py-3 bg-[#34C759] text-white rounded-xl text-[17px] font-semibold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                <Save size={18} />
                {saving ? 'Зберігаю...' : 'Зберегти'}
              </button>
            </div>
          ) : (
            /* Історія та порівняння */
            <div className="space-y-4">
              {measurements.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl">
                  <Scale size={40} className="mx-auto text-[#C7C7CC] mb-3" />
                  <p className="text-[15px] text-[#8E8E93]">Ще немає замірів</p>
                  <p className="text-[13px] text-[#C7C7CC] mt-1">Додайте перший замір</p>
                </div>
              ) : (
                <>
                  {/* Компактна таблиця прогресу */}
                  <div className="bg-white rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#007AFF]/10 text-[#007AFF] font-semibold text-[15px]">
                      Прогрес
                    </div>

                    {/* Рядки параметрів */}
                    {comparisonData && MEASUREMENT_PARAMS.map((param, idx) => {
                      const initial = comparisonData.initial?.[param.key];
                      const current = comparisonData.current?.[param.key];
                      const totalDiff = calculateMeasurementDiff(current, initial);
                      const totalFormat = formatDiff(totalDiff);

                      // Пропускаємо параметри без даних
                      if (initial === undefined && current === undefined) return null;

                      return (
                        <div
                          key={param.key}
                          className="flex items-center justify-between px-4 py-2.5 border-t border-[#C6C6C8]/30"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{param.icon}</span>
                            <span className="text-[15px] text-black">{param.label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-[13px] text-[#8E8E93]">{initial ?? 'Немає'}</span>
                              <span className="text-[#C7C7CC] mx-1">→</span>
                              <span className="text-[15px] font-semibold text-black">
                                {current ?? 'Немає'}
                              </span>
                            </div>
                            <div className={`flex items-center gap-0.5 min-w-[50px] justify-end ${totalFormat.color}`}>
                              {totalFormat.icon}
                              <span className="text-[13px] font-medium">{totalFormat.text}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Дати */}
                    {comparisonData && (
                      <div className="px-4 py-2 bg-[#F2F2F7] text-[11px] text-[#8E8E93] flex justify-between border-t border-[#C6C6C8]/30">
                        <span>{formatDate(comparisonData.initial?.date)}</span>
                        <span>→</span>
                        <span>{formatDate(comparisonData.current?.date)}</span>
                      </div>
                    )}
                  </div>

                  {/* Список всіх замірів */}
                  <div>
                    <h3 className="font-semibold text-[15px] text-black mb-2 px-1">Всі заміри</h3>
                    <div className="space-y-2">
                      {[...measurements].reverse().map(measurement => (
                        <div
                          key={measurement.id}
                          className="bg-white rounded-xl p-3"
                        >
                          <div className="text-[15px] font-medium text-black mb-2">
                            {new Date(measurement.date).toLocaleDateString('uk-UA', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#8E8E93]">
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
