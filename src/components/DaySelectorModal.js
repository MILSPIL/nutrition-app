import React from 'react';
import { X } from 'lucide-react';
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
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">📅 Вибір дня</h3>
          <button onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Перейти на день:</label>
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
              className="w-full px-4 py-3 border rounded-lg text-center text-2xl font-bold"
            />
          </div>

          {startDate && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                💡 <strong>Поточний день:</strong> {calculateCurrentDay(startDate)}<br />
                🚫 Не можна вибрати майбутні дні
              </p>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800">
              ⚠️ <strong>Увага:</strong> Це потрібно лише для виправлення пропущених звітів.<br />
              Завтра день автоматично оновиться!
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (startDate) {
                  onDayChange(calculateCurrentDay(startDate));
                }
              }}
              className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
            >
              🔄 Поточний
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              ✅ Готово
            </button>
          </div>
        </div>
      </div>
    </AnimatedModal>
  );
}
