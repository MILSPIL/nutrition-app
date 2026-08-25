import React, { useState, useEffect } from 'react';

export default function AnimatedModal({
  isOpen,
  onClose,
  children,
  position = 'bottom' // 'center' | 'bottom' | 'top'
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Запобігаємо скролу body
      document.body.style.overflow = 'hidden';
      // Затримка для запуску анімації після монтування
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      // Чекаємо завершення анімації перед приховуванням
      const timer = setTimeout(() => {
        setIsVisible(false);
        document.body.style.overflow = '';
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Визначаємо позиціонування
  const getAlignmentClass = () => {
    switch (position) {
      case 'top':
        return 'items-start pt-12 sm:pt-20';
      case 'bottom':
        return 'items-end sm:items-center';
      default:
        return 'items-center';
    }
  };

  // Визначаємо анімацію
  const getAnimationClass = () => {
    if (position === 'top') {
      return isAnimating
        ? 'translate-y-0 opacity-100'
        : '-translate-y-full opacity-0';
    }
    if (position === 'bottom') {
      return isAnimating
        ? 'translate-y-0 opacity-100'
        : 'translate-y-full opacity-0';
    }
    // center
    return isAnimating
      ? 'scale-100 opacity-100'
      : 'scale-95 opacity-0';
  };

  // Визначаємо стиль контейнера
  const getContainerClass = () => {
    if (position === 'top') {
      return 'rounded-b-3xl sm:rounded-2xl';
    }
    if (position === 'bottom') {
      return 'rounded-t-3xl sm:rounded-2xl';
    }
    return 'rounded-2xl mx-4';
  };

  return (
    <div
      className={`
        fixed inset-0 z-50 flex
        ${getAlignmentClass()}
        justify-center
        transition-all duration-300 ease-out
        ${isAnimating ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/0'}
      `}
      onClick={handleBackdropClick}
    >
      <div
        className={`
          w-full sm:max-w-md
          transition-all duration-300 ease-out
          ${getAnimationClass()}
        `}
      >
        {/* iOS Sheet Style Container */}
        <div className={`
          bg-white
          ${getContainerClass()}
          max-h-[90vh] overflow-hidden
          shadow-xl
        `}>
          {/* Handle for mobile (bottom sheet) */}
          {position === 'bottom' && (
            <div className="flex justify-center pt-2 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-[#C6C6C8] rounded-full" />
            </div>
          )}

          {/* Handle for mobile (top sheet) */}
          {position === 'top' && (
            <div className="flex justify-center pb-2 pt-1 sm:hidden order-last">
              <div className="w-10 h-1 bg-[#C6C6C8] rounded-full" />
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
