import React, { useState } from 'react';
import { X, Copy, Check, FileText, Send } from 'lucide-react';
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
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-[#007AFF]" />
            <h3 className="text-[17px] font-semibold text-black">Звіт для тренера</h3>
          </div>
          <button onClick={onClose} className="p-1 text-[#007AFF] active:opacity-50">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#F2F2F7]">
          <pre className="bg-white rounded-xl p-4 text-[13px] whitespace-pre-wrap font-mono text-black leading-relaxed">
            {report}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[#C6C6C8]/30 p-4">
          {/* Telegram input */}
          <div className="mb-4">
            <label className="block text-[13px] text-[#8E8E93] mb-2 px-1">Telegram тренера</label>
            <div className="flex items-center gap-2">
              <span className="text-[#8E8E93] text-[15px]">@</span>
              <input
                type="text"
                value={trainerTelegram}
                onChange={(e) => onTrainerChange(e.target.value.replace('@', ''))}
                className="flex-1 px-4 py-2.5 bg-[#F2F2F7] rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                placeholder="username"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={copyReport}
              className={`flex-1 py-3 rounded-xl text-[17px] font-semibold flex items-center justify-center gap-2 active:opacity-80 ${
                copiedReport
                  ? 'bg-[#34C759] text-white'
                  : 'bg-[#007AFF]/10 text-[#007AFF]'
              }`}
            >
              {copiedReport ? (
                <>
                  <Check size={20} />
                  Скопійовано
                </>
              ) : (
                <>
                  <Copy size={20} />
                  Копіювати
                </>
              )}
            </button>
            <button
              onClick={sendToTelegram}
              className="flex-1 py-3 bg-[#007AFF] text-white rounded-xl text-[17px] font-semibold flex items-center justify-center gap-2 active:opacity-80"
            >
              <Send size={20} />
              Telegram
            </button>
          </div>
        </div>
      </div>
    </AnimatedModal>
  );
}
