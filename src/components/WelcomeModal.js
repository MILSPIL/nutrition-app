import React, { useState, useEffect } from 'react';
import { X, Sparkles, CheckCircle } from 'lucide-react';
import AnimatedModal from './AnimatedModal';

const APP_VERSION = '1.3.0';

const CHANGELOG = [
  {
    version: '1.3.0',
    date: '10.01.2026',
    changes: [
      'Тренерський дашборд (/trainer)',
      'Real-time моніторинг клієнтів',
      'Історія харчування по днях',
      'Підключення тренера через email'
    ]
  },
  {
    version: '1.2.1',
    date: '10.01.2026',
    changes: [
      'Показ калорій за день у хедері',
      'Компактний дизайн БЖВ панелі'
    ]
  },
  {
    version: '1.2.0',
    date: '10.01.2026',
    changes: [
      'Додано калорійність до всіх продуктів',
      'Редагування БЖВ та калорійності прямо з меню',
      'Показ БЖВ та ккал під кожним продуктом',
      'Збереження персональних змін в хмарі',
      'Можливість скинути до стандартних значень'
    ]
  },
  {
    version: '1.1.0',
    date: '09.01.2026',
    changes: [
      'Додано плавні анімації для всіх вікон',
      'Замінено alert на стильні повідомлення',
      'Покращено екран завантаження',
      'Оптимізовано код додатку'
    ]
  },
  {
    version: '1.0.0',
    date: '08.01.2026',
    changes: [
      'Перший реліз додатку',
      'Google авторизація',
      'Трекінг харчування по прийомах',
      'Звіт для тренера в Telegram'
    ]
  }
];

export default function WelcomeModal({ userName }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const lastSeenVersion = localStorage.getItem('app_version_seen');
    if (lastSeenVersion !== APP_VERSION) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('app_version_seen', APP_VERSION);
    setIsOpen(false);
  };

  const latestChanges = CHANGELOG[0];

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#34C759]/10 rounded-xl flex items-center justify-center">
              <Sparkles className="text-[#34C759]" size={20} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-black">
                {userName ? `Привіт, ${userName.split(' ')[0]}!` : 'Привіт!'}
              </h2>
              <span className="text-[13px] text-[#8E8E93]">Версія {APP_VERSION}</span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-[#007AFF] active:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Що нового */}
          <div className="bg-[#007AFF]/10 rounded-xl p-4 mb-4">
            <h3 className="text-[15px] font-semibold text-[#007AFF] mb-3 flex items-center gap-2">
              <span>Що нового у v{latestChanges.version}</span>
              <span className="text-[11px] bg-[#34C759] text-white px-2 py-0.5 rounded-full font-medium">NEW</span>
            </h3>
            <ul className="space-y-2">
              {latestChanges.changes.map((change, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[15px] text-black">
                  <CheckCircle size={16} className="text-[#34C759] mt-0.5 flex-shrink-0" />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Попередні версії */}
          {CHANGELOG.length > 1 && (
            <details className="mb-4">
              <summary className="text-[13px] text-[#8E8E93] cursor-pointer active:opacity-50">
                Попередні версії
              </summary>
              <div className="mt-3 space-y-3 pl-3 border-l-2 border-[#C6C6C8]/50">
                {CHANGELOG.slice(1).map((release) => (
                  <div key={release.version}>
                    <div className="text-[13px] font-semibold text-black">
                      v{release.version} <span className="text-[#8E8E93] font-normal">({release.date})</span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {release.changes.map((change, idx) => (
                        <li key={idx} className="text-[13px] text-[#8E8E93]">• {change}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-[#C6C6C8]/30">
          <button
            onClick={handleClose}
            className="w-full py-3 bg-[#34C759] text-white rounded-xl text-[17px] font-semibold active:opacity-80"
          >
            Почати!
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}

export { APP_VERSION };
