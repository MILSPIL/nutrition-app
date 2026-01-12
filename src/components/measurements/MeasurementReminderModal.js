import React from 'react';
import { X, ChevronRight, Bell, Ruler } from 'lucide-react';
import AnimatedModal from '../AnimatedModal';

export default function MeasurementReminderModal({
  isOpen,
  onClose,
  onOpenMeasurements,
  onDismiss
}) {
  const handleOpenMeasurements = () => {
    onClose();
    onOpenMeasurements();
  };

  const handleDismiss = () => {
    // Зберігаємо що користувач закрив нагадування
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('measurementReminderDismissed', today);
    onClose();
    if (onDismiss) onDismiss();
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleDismiss} position="center">
      {/* Header */}
      <div className="relative bg-gradient-to-br from-[#007AFF] to-[#5856D6] px-6 py-8 text-center">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-2 text-white/70 active:opacity-50"
        >
          <X size={24} />
        </button>

        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Bell size={32} className="text-white" />
        </div>

        <h2 className="text-[22px] font-bold text-white mb-2">
          Час для замірів!
        </h2>
        <p className="text-[15px] text-white/80">
          Сьогодні понеділок — час зробити заміри тіла та зважитись
        </p>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="bg-[#F2F2F7] rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-[#007AFF]/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Ruler size={20} className="text-[#007AFF]" />
            </div>
            <div>
              <div className="text-[15px] font-medium text-black mb-1">
                Чому це важливо?
              </div>
              <div className="text-[13px] text-[#8E8E93] leading-relaxed">
                Регулярні заміри допомагають відстежувати прогрес та коригувати програму харчування
              </div>
            </div>
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={handleOpenMeasurements}
          className="w-full flex items-center justify-between px-4 py-4 bg-[#007AFF] text-white rounded-xl active:opacity-80"
        >
          <div className="flex items-center gap-3">
            <Ruler size={22} />
            <span className="text-[17px] font-semibold">Зробити заміри</span>
          </div>
          <ChevronRight size={20} />
        </button>

        {/* Skip button */}
        <button
          onClick={handleDismiss}
          className="w-full py-3 text-[#8E8E93] text-[15px] mt-2 active:opacity-50"
        >
          Нагадати пізніше
        </button>
      </div>
    </AnimatedModal>
  );
}
