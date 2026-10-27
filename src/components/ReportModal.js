import React, { useEffect, useRef, useState } from 'react';
import { X, Copy, Check, FileText } from 'lucide-react';
import AnimatedModal from './AnimatedModal';

export default function ReportModal({ isOpen, onClose, report }) {
  const [copyState, setCopyState] = useState('idle');
  const generation = useRef(0);
  const copying = useRef(false);

  useEffect(() => {
    generation.current += 1;
    copying.current = false;
    setCopyState('idle');
    return () => { generation.current += 1; };
  }, [isOpen, report]);

  const copyReport = async () => {
    if (copying.current) return;
    const attempt = generation.current;
    copying.current = true;
    setCopyState('copying');
    try {
      if (!navigator.clipboard?.writeText) throw Error('clipboard_unavailable');
      await navigator.clipboard.writeText(report);
      if (attempt === generation.current) setCopyState('copied');
    } catch {
      if (attempt === generation.current) setCopyState('error');
    } finally {
      if (attempt === generation.current) copying.current = false;
    }
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-[#007AFF]" />
            <h3 className="text-[17px] font-semibold text-black">Звіт про харчування</h3>
          </div>
          <button onClick={onClose} aria-label="Закрити звіт" className="p-1 text-[#007AFF] active:opacity-50">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-[#F2F2F7]">
          <pre className="bg-white rounded-xl p-4 text-[13px] whitespace-pre-wrap break-words select-text font-mono text-black leading-relaxed">
            {report}
          </pre>
        </div>

        <div className="flex-shrink-0 border-t border-[#C6C6C8]/30 p-4">
          <p className="text-[13px] text-[#8E8E93] mb-3">Перевірте звіт і скопіюйте його, щоб поділитися.</p>
          {copyState === 'error' && (
            <p role="alert" className="text-[13px] text-[#C62828] mb-3">
              Не вдалося скопіювати. Спробуйте ще раз або виділіть текст звіту й скопіюйте вручну.
            </p>
          )}
          <button
            onClick={copyReport}
            disabled={copyState === 'copying'}
            aria-live="polite"
            className={`w-full py-3 rounded-xl text-[17px] font-semibold flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50 ${
              copyState === 'copied' ? 'bg-[#34C759] text-white' : 'bg-[#007AFF]/10 text-[#007AFF]'
            }`}
          >
            {copyState === 'copied' ? <Check size={20} /> : <Copy size={20} />}
            {copyState === 'copied' ? 'Скопійовано' : copyState === 'copying' ? 'Копіювання…' : 'Копіювати'}
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}
