import React, { useEffect, useState } from 'react';
import { X, Calendar, RotateCcw } from 'lucide-react';
import AnimatedModal from './AnimatedModal';

export default function DaySelectorModal({
  isOpen,
  onClose,
  programDay,
  onDayChange,
  startDate,
  calculateCurrentDay,
  disabled = false
}) {
  const maxDay = startDate ? calculateCurrentDay(startDate) : 999;
  const [inputDay, setInputDay] = useState(String(programDay));
  useEffect(() => {
    if (isOpen) setInputDay(String(programDay));
  }, [isOpen, programDay]);
  const chosenDay = Number(inputDay);
  const validDay = inputDay.trim() !== '' && Number.isInteger(chosenDay) && chosenDay >= 1 && chosenDay <= maxDay;
  const confirmDay = () => {
    if (disabled || !validDay) return;
    onDayChange(chosenDay);
    onClose();
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-[#007AFF]" />
            <h3 className="text-[17px] font-semibold text-black">Вибір дня</h3>
          </div>
          <button onClick={onClose} className="p-1 text-[#007AFF] active:opacity-50">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Day Input */}
          <div>
            <label htmlFor="program-day" className="block text-[13px] text-[#8E8E93] mb-2 px-1">
              Перейти на день
            </label>
            <input
              id="program-day"
              type="number"
              inputMode="numeric"
              min="1"
              max={maxDay}
              value={inputDay}
              disabled={disabled}
              onChange={(e) => setInputDay(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmDay(); }}
              className="w-full px-4 py-4 bg-[#F2F2F7] rounded-xl text-center text-[28px] font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
            />
          </div>

          {/* Current Day Info */}
          {startDate && (
            <div className="bg-[#007AFF]/10 rounded-xl p-4">
              <p className="text-[15px] text-[#007AFF]">
                <span className="font-semibold">Поточний день:</span> {calculateCurrentDay(startDate)}
              </p>
              <p className="text-[13px] text-[#007AFF]/70 mt-1">
                Не можна вибрати майбутні дні
              </p>
            </div>
          )}

          {/* Warning */}
          <div className="bg-[#FF9500]/10 rounded-xl p-4">
            <p className="text-[13px] text-[#FF9500]">
              Використовуйте це, щоб виправити пропущені звіти. Завтра день оновиться сам.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              disabled={disabled || !startDate}
              onClick={() => setInputDay(String(maxDay))}
              className="flex-1 py-3 bg-[#F2F2F7] text-[#007AFF] rounded-xl text-[17px] font-medium flex items-center justify-center gap-2 active:bg-[#E5E5EA]"
            >
              <RotateCcw size={18} />
              Поточний
            </button>
            <button
              onClick={confirmDay}
              disabled={disabled || !validDay}
              className="flex-1 py-3 bg-[#34C759] text-white rounded-xl text-[17px] font-semibold active:opacity-80 disabled:opacity-50"
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    </AnimatedModal>
  );
}
