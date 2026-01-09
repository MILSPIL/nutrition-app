import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { toast } from './Toast';
import AnimatedModal from './AnimatedModal';

export default function ReportModal({
  isOpen,
  onClose,
  report,
  trainerTelegram,
  onTrainerChange,
  activity,
  otherActivity
}) {
  const [copiedReport, setCopiedReport] = useState(false);

  const copyReport = () => {
    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const sendToTelegram = () => {
    if (!activity && !otherActivity) {
      toast.warning("Заповніть рухову активність!");
      return;
    }
    const encodedText = encodeURIComponent(report);
    window.open(`https://t.me/${trainerTelegram}?text=${encodedText}`, '_blank');
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-xl font-semibold">📋 Звіт для тренера</h3>
          <button onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <pre className="bg-gray-50 p-4 rounded text-sm whitespace-pre-wrap font-mono">
            {report}
          </pre>
        </div>

        <div className="border-t p-4">
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Telegram тренера</label>
            <div className="flex gap-2 items-center">
              <span className="text-gray-500">@</span>
              <input
                type="text"
                value={trainerTelegram}
                onChange={(e) => onTrainerChange(e.target.value.replace('@', ''))}
                className="flex-1 px-3 py-2 border rounded text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={copyReport} className="flex-1 py-3 bg-blue-500 text-white rounded-lg font-semibold flex items-center justify-center gap-2">
              {copiedReport ? <><Check size={20} />Скопійовано!</> : <><Copy size={20} />Копіювати</>}
            </button>
            <button onClick={sendToTelegram} className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold">
              📱 Telegram
            </button>
          </div>
        </div>
      </div>
    </AnimatedModal>
  );
}
