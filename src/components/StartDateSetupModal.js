import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { toast } from './Toast';
import AnimatedModal from './AnimatedModal';

export default function StartDateSetupModal({
  isOpen,
  onClose,
  currentStartDate,
  onSave,
  calculateCurrentDay
}) {
  const [tempStartDate, setTempStartDate] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTempStartDate(currentStartDate || "");
    }
  }, [isOpen, currentStartDate]);

  const handleSave = () => {
    if (!tempStartDate) {
      toast.warning('Вкажіть дату початку!');
      return;
    }
    onSave(tempStartDate);
    setTempStartDate("");
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">📅 Налаштування дати початку</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>
        <div className="text-center mb-6">
          <p className="text-sm text-gray-600">Вкажіть коли почалась ваша програма</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Дата початку програми:</label>
            <input
              type="date"
              value={tempStartDate}
              onChange={(e) => setTempStartDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 border rounded-lg text-center text-lg"
            />
          </div>

          {tempStartDate && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                🎯 <strong>День програми:</strong> {calculateCurrentDay(tempStartDate)}
              </p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              💡 <strong>Як це працює:</strong><br />
              Виберіть дату коли почали програму, і додаток автоматично розрахує день.
              Завтра день збільшиться автоматично!
            </p>
          </div>

          {currentStartDate && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                📌 <strong>Поточна дата початку:</strong> {new Date(currentStartDate).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
          )}

          <button
            onClick={handleSave}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
          >
            ✅ Зберегти
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}
