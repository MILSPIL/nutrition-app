import React, { useState, useEffect } from 'react';

export default function AnimatedModal({
  isOpen,
  onClose,
  children,
  position = 'center' // 'center' | 'bottom'
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
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
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const backdropClasses = `
    fixed inset-0 z-50 flex
    ${position === 'bottom' ? 'items-end sm:items-center' : 'items-center'}
    justify-center p-4
    transition-all duration-200 ease-out
    ${isAnimating ? 'bg-black/50' : 'bg-black/0'}
  `;

  const modalClasses = position === 'bottom'
    ? `
        transition-all duration-200 ease-out
        ${isAnimating
          ? 'translate-y-0 opacity-100'
          : 'translate-y-full sm:translate-y-0 sm:scale-95 opacity-0'
        }
      `
    : `
        transition-all duration-200 ease-out
        ${isAnimating
          ? 'scale-100 opacity-100'
          : 'scale-95 opacity-0'
        }
      `;

  return (
    <div className={backdropClasses} onClick={handleBackdropClick}>
      <div className={modalClasses}>
        {children}
      </div>
    </div>
  );
}
