import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { X, Check, AlertTriangle, Info } from 'lucide-react';

// Глобальний ref для доступу до toast ззовні
let toastRef = null;

// iOS Toast типи та їх стилі
const TOAST_TYPES = {
  success: {
    bgIcon: 'bg-[#34C759]',
    icon: Check,
  },
  error: {
    bgIcon: 'bg-[#FF3B30]',
    icon: X,
  },
  warning: {
    bgIcon: 'bg-[#FF9500]',
    icon: AlertTriangle,
  },
  info: {
    bgIcon: 'bg-[#007AFF]',
    icon: Info,
  }
};

// Окремий Toast компонент - iOS style
function ToastItem({ id, message, type = 'info', onClose }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const config = TOAST_TYPES[type] || TOAST_TYPES.info;
  const Icon = config.icon;

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));

    const timer = setTimeout(() => {
      handleClose();
    }, 3000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => onClose(id), 300);
  };

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3
        bg-white/95 backdrop-blur-xl
        rounded-2xl shadow-lg border border-black/5
        transition-all duration-300 ease-out
        ${isVisible && !isLeaving
          ? 'translate-y-0 opacity-100 scale-100'
          : '-translate-y-4 opacity-0 scale-95'}
      `}
      style={{ minWidth: '280px', maxWidth: '340px' }}
      onClick={handleClose}
    >
      <div className={`w-8 h-8 ${config.bgIcon} rounded-full flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className="text-white" strokeWidth={2.5} />
      </div>
      <p className="flex-1 text-[15px] font-medium text-black">{message}</p>
    </div>
  );
}

// Toast контейнер - top center для iOS style
function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map(toast => (
        <ToastItem
          key={toast.id}
          {...toast}
          onClose={removeToast}
        />
      ))}
    </div>
  );
}

// Context для toast
const ToastContext = createContext(null);

// Toast Provider
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toastMethods = useRef({
    success: (message) => addToast(message, 'success'),
    error: (message) => addToast(message, 'error'),
    warning: (message) => addToast(message, 'warning'),
    info: (message) => addToast(message, 'info')
  });

  // Оновлюємо методи коли addToast змінюється
  useEffect(() => {
    toastMethods.current = {
      success: (message) => addToast(message, 'success'),
      error: (message) => addToast(message, 'error'),
      warning: (message) => addToast(message, 'warning'),
      info: (message) => addToast(message, 'info')
    };
    // Встановлюємо глобальний ref
    toastRef = toastMethods.current;
  }, [addToast]);

  return (
    <ToastContext.Provider value={toastMethods.current}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

// Hook для використання toast всередині Provider
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

// Глобальний toast для використання поза React компонентами або перед Provider
export const toast = {
  success: (message) => toastRef?.success(message),
  error: (message) => toastRef?.error(message),
  warning: (message) => toastRef?.warning(message),
  info: (message) => toastRef?.info(message)
};
