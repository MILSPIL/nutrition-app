import React, { useState, useEffect } from 'react';
import { X, Calendar, Check } from 'lucide-react';
import { toast } from './Toast';
import AnimatedModal from './AnimatedModal';
import { getDateInputMax } from '../utils/date';

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
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-[#007AFF]" />
            <h2 className="text-[17px] font-semibold text-black">Дата початку програми</h2>
          </div>
          <button onClick={onClose} className="p-1 text-[#007AFF] active:opacity-50">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-[15px] text-[#8E8E93] text-center">
            Вкажіть коли почалась ваша програма
          </p>

          {/* Date Input */}
          <div>
            <label className="block text-[13px] text-[#8E8E93] mb-2 px-1">Дата початку</label>
            <input
              type="date"
              value={tempStartDate}
              onChange={(e) => setTempStartDate(e.target.value)}
              max={getDateInputMax()}
              className="w-full px-4 py-4 bg-[#F2F2F7] rounded-xl text-[17px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
            />
          </div>

          {/* Day calculation */}
          {tempStartDate && (
            <div className="bg-[#34C759]/10 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <Check size={18} className="text-[#34C759]" />
                <p className="text-[15px] text-[#34C759] font-semibold">
                  День програми: {calculateCurrentDay(tempStartDate)}
                </p>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-[#007AFF]/10 rounded-xl p-4">
            <p className="text-[13px] text-[#007AFF]">
              <span className="font-semibold">Як це працює:</span> Виберіть дату коли почали програму, і додаток автоматично розрахує день. Завтра день збільшиться автоматично!
            </p>
          </div>

          {/* Current date info */}
          {currentStartDate && (
            <div className="bg-[#FF9500]/10 rounded-xl p-4">
              <p className="text-[13px] text-[#FF9500]">
                <span className="font-semibold">Поточна дата початку:</span> {new Date(currentStartDate).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            className="w-full py-3 bg-[#34C759] text-white rounded-xl text-[17px] font-semibold active:opacity-80"
          >
            Зберегти
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}
