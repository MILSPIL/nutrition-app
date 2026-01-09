import React, { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

// Глобальний ref для доступу до toast ззовні
let toastRef = null;

// Toast типи та їх стилі
const TOAST_TYPES = {
  success: {
    bg: 'bg-green-50 border-green-500',
    icon: CheckCircle,
    iconColor: 'text-green-500'
  },
  error: {
    bg: 'bg-red-50 border-red-500',
    icon: AlertCircle,
    iconColor: 'text-red-500'
  },
  warning: {
    bg: 'bg-yellow-50 border-yellow-500',
    icon: AlertCircle,
    iconColor: 'text-yellow-500'
  },
  info: {
    bg: 'bg-blue-50 border-blue-500',
    icon: Info,
    iconColor: 'text-blue-500'
  }
};

// Окремий Toast компонент
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
        flex items-center gap-3 p-4 rounded-lg border-l-4 shadow-lg bg-white
        transition-all duration-300 ease-out
        ${config.bg}
        ${isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
      style={{ minWidth: '280px', maxWidth: '400px' }}
    >
      <Icon size={20} className={config.iconColor} />
      <p className="flex-1 text-sm text-gray-800">{message}</p>
      <button
        onClick={handleClose}
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}

// Toast контейнер
function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
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
