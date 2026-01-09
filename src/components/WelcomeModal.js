import React, { useState, useEffect } from 'react';
import { X, Sparkles, CheckCircle } from 'lucide-react';
import AnimatedModal from './AnimatedModal';

const APP_VERSION = '1.1.0';

const CHANGELOG = [
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
      <div className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Sparkles className="text-green-600" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                {userName ? `Привіт, ${userName.split(' ')[0]}!` : 'Привіт!'}
              </h2>
              <span className="text-sm text-gray-500">Версія {APP_VERSION}</span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Що нового */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-4 mb-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>Що нового у v{latestChanges.version}</span>
            <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">NEW</span>
          </h3>
          <ul className="space-y-2">
            {latestChanges.changes.map((change, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Попередні версії */}
        {CHANGELOG.length > 1 && (
          <details className="mb-4">
            <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
              Попередні версії
            </summary>
            <div className="mt-2 space-y-3 pl-2 border-l-2 border-gray-200">
              {CHANGELOG.slice(1).map((release) => (
                <div key={release.version} className="text-sm">
                  <div className="font-medium text-gray-700">
                    v{release.version} <span className="text-gray-400">({release.date})</span>
                  </div>
                  <ul className="mt-1 space-y-1 text-gray-600">
                    {release.changes.map((change, idx) => (
                      <li key={idx} className="text-xs">• {change}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Кнопка */}
        <button
          onClick={handleClose}
          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors"
        >
          Почати!
        </button>
      </div>
    </AnimatedModal>
  );
}

export { APP_VERSION };
