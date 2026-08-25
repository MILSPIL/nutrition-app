import React from 'react';
import { User, ChevronRight, Clock } from 'lucide-react';

export default function ClientCard({ client, todayMeals, onClick, isLast }) {
  const macros = todayMeals?.totalMacros || { p: 0, f: 0, c: 0, cal: 0 };
  const proteinPercent = Math.round((macros.p / 140) * 100);
  const hasActivity = todayMeals && (Object.keys(todayMeals.meals || {}).some(k =>
    Object.keys(todayMeals.meals[k] || {}).length > 0
  ));

  // Визначаємо статус з iOS кольорами
  let statusBg = 'bg-[#8E8E93]/10';
  let statusColor = 'text-[#8E8E93]';
  let statusText = 'Не почав';
  let progressColor = '#FF9500';

  if (hasActivity) {
    if (proteinPercent > 100) {
      statusBg = 'bg-[#FF9500]/10';
      statusColor = 'text-[#FF9500]';
      statusText = 'Понад норму';
      progressColor = '#FF9500';
    } else if (proteinPercent === 100) {
      statusBg = 'bg-[#34C759]/10';
      statusColor = 'text-[#34C759]';
      statusText = 'Виконано';
      progressColor = '#34C759';
    } else {
      statusBg = 'bg-[#FF9500]/10';
      statusColor = 'text-[#FF9500]';
      statusText = 'В процесі';
      progressColor = '#FF9500';
    }
  }

  // Час останнього оновлення
  const lastUpdate = todayMeals?.updatedAt
    ? new Date(todayMeals.updatedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-3 text-left active:bg-[#F2F2F7] ${!isLast ? 'border-b border-[#C6C6C8]/30' : ''}`}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 bg-[#F2F2F7] rounded-full flex items-center justify-center flex-shrink-0">
          <User size={24} className="text-[#8E8E93]" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[17px] font-semibold text-black truncate">{client.name || 'Клієнт'}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusBg} ${statusColor}`}>
              {statusText}
            </span>
          </div>

          {/* Progress bar */}
          {hasActivity && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-[13px] text-[#8E8E93] mb-1">
                <span>Білки: {macros.p}г / 140г</span>
                <span style={{ color: progressColor }}>{proteinPercent}%</span>
              </div>
              <div className="h-1.5 bg-[#F2F2F7] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(proteinPercent, 100)}%`,
                    backgroundColor: progressColor
                  }}
                />
              </div>
            </div>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-3 text-[13px] text-[#8E8E93]">
            {todayMeals?.programDay && (
              <span>День {todayMeals.programDay}</span>
            )}
            {macros.cal > 0 && (
              <span>{macros.cal} ккал</span>
            )}
            {lastUpdate && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {lastUpdate}
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight size={20} className="text-[#C7C7CC] flex-shrink-0" />
      </div>
    </button>
  );
}
