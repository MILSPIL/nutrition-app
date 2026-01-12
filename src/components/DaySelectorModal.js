import React from 'react';
import { X, Calendar, RotateCcw } from 'lucide-react';
import AnimatedModal from './AnimatedModal';

export default function DaySelectorModal({
  isOpen,
  onClose,
  programDay,
  onDayChange,
  startDate,
  calculateCurrentDay
}) {
  const maxDay = startDate ? calculateCurrentDay(startDate) : 999;

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
            <label className="block text-[13px] text-[#8E8E93] mb-2 px-1">
              Перейти на день
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={maxDay}
              value={programDay}
              onChange={(e) => {
                const newDay = parseInt(e.target.value) || 1;
                if (newDay <= maxDay) {
                  onDayChange(newDay);
                }
              }}
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
              <span className="font-semibold">Увага:</span> Це потрібно лише для виправлення пропущених звітів. Завтра день оновиться автоматично!
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (startDate) {
                  onDayChange(calculateCurrentDay(startDate));
                }
              }}
              className="flex-1 py-3 bg-[#F2F2F7] text-[#007AFF] rounded-xl text-[17px] font-medium flex items-center justify-center gap-2 active:bg-[#E5E5EA]"
            >
              <RotateCcw size={18} />
              Поточний
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-[#34C759] text-white rounded-xl text-[17px] font-semibold active:opacity-80"
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    </AnimatedModal>
  );
}
