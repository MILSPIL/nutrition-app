import React from 'react';
import { User, ChevronRight, Clock } from 'lucide-react';

export default function ClientCard({ client, todayMeals, onClick }) {
  const macros = todayMeals?.totalMacros || { p: 0, f: 0, c: 0, cal: 0 };
  const proteinPercent = Math.round((macros.p / 140) * 100);
  const hasActivity = todayMeals && (Object.keys(todayMeals.meals || {}).some(k =>
    Object.keys(todayMeals.meals[k] || {}).length > 0
  ));

  // Визначаємо статус
  let status = 'inactive';
  let statusColor = 'gray';
  let statusText = 'Не почав';

  if (hasActivity) {
    if (proteinPercent >= 100) {
      status = 'completed';
      statusColor = 'green';
      statusText = 'Виконано';
    } else {
      status = 'inProgress';
      statusColor = 'orange';
      statusText = 'В процесі';
    }
  }

  // Час останнього оновлення
  const lastUpdate = todayMeals?.updatedAt
    ? new Date(todayMeals.updatedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-left"
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
          <User size={24} className="text-gray-400" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-800 truncate">{client.name || 'Клієнт'}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full bg-${statusColor}-100 text-${statusColor}-700`}
              style={{
                backgroundColor: statusColor === 'green' ? '#dcfce7' : statusColor === 'orange' ? '#ffedd5' : '#f3f4f6',
                color: statusColor === 'green' ? '#15803d' : statusColor === 'orange' ? '#c2410c' : '#6b7280'
              }}
            >
              {statusText}
            </span>
          </div>

          {/* Progress bar */}
          {hasActivity && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Білки: {macros.p}г / 140г</span>
                <span>{proteinPercent}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(proteinPercent, 100)}%`,
                    backgroundColor: proteinPercent >= 100 ? '#22c55e' : '#f97316'
                  }}
                />
              </div>
            </div>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
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
        <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
      </div>
    </button>
  );
}
