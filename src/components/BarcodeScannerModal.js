import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Loader2, AlertCircle, CheckCircle2, Scan } from 'lucide-react';
import { getProductByBarcode, isValidBarcode, normalizeBarcode } from '../services/openFoodFacts';
import AnimatedModal from './AnimatedModal';

const BarcodeScannerModal = ({ isOpen, onClose, onProductFound, toast }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [foundProduct, setFoundProduct] = useState(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);

  const html5QrCodeRef = useRef(null);
  const isScanningRef = useRef(false);
  const isTransitioningRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (isTransitioningRef.current) {
      return;
    }

    if (html5QrCodeRef.current && isScanningRef.current) {
      isTransitioningRef.current = true;
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        // html5-qrcode може викидати помилку якщо камера вже зупинена.
      }
      isScanningRef.current = false;
      isTransitioningRef.current = false;
    }
  }, []);

  const searchProduct = useCallback(async (barcode) => {
    const normalizedBarcode = normalizeBarcode(barcode);

    if (!normalizedBarcode) {
      setError('Введіть штрих-код');
      return;
    }

    if (!isValidBarcode(normalizedBarcode)) {
      setError('Підтримуються EAN-8, EAN-13 та UPC-A коди');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await getProductByBarcode(normalizedBarcode);

    setIsLoading(false);

    if (result.success) {
      setFoundProduct(result.product);
    } else {
      setError(result.error);
    }
  }, []);

  const startScanner = useCallback(async () => {
    // Чекаємо якщо йде перехід
    if (isTransitioningRef.current) {
      setTimeout(startScanner, 300);
      return;
    }

    const scannerElement = document.getElementById('barcode-scanner');
    if (!scannerElement) {
      setTimeout(startScanner, 100);
      return;
    }

    if (isScanningRef.current) {
      return;
    }

    isTransitioningRef.current = true;

    try {
      setError(null);
      setScannerReady(false);

      // Створюємо новий інстанс
      if (html5QrCodeRef.current) {
        try {
          html5QrCodeRef.current.clear();
        } catch (e) {}
      }
      html5QrCodeRef.current = new Html5Qrcode('barcode-scanner');

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 100 },
          aspectRatio: 1.5
        },
        async (decodedText) => {
          if (navigator.vibrate) {
            navigator.vibrate(100);
          }

          // Зупиняємо сканер перед пошуком
          isScanningRef.current = false;
          isTransitioningRef.current = true;
          try {
            await html5QrCodeRef.current.stop();
          } catch (e) {}
          isTransitioningRef.current = false;

          await searchProduct(decodedText);
        },
        () => {}
      );

      isScanningRef.current = true;
      isTransitioningRef.current = false;
      setScannerReady(true);
    } catch (err) {
      console.error('Scanner error:', err);
      isScanningRef.current = false;
      isTransitioningRef.current = false;

      const errStr = err.toString();
      if (errStr.includes('NotAllowedError')) {
        setError('Доступ до камери заборонено. Дозвольте доступ у налаштуваннях браузера.');
      } else if (errStr.includes('NotFoundError')) {
        setError('Камера не знайдена.');
        setShowManualInput(true);
      } else if (errStr.includes('NotReadableError')) {
        setError('Камера зайнята іншим додатком.');
      } else if (errStr.includes('already under transition')) {
        // Повторюємо спробу через затримку
        setTimeout(startScanner, 500);
      } else {
        setError(`Помилка камери: ${err.message || err}`);
      }
    }
  }, [searchProduct]);

  // Запуск сканера при відкритті
  useEffect(() => {
    if (isOpen && !showManualInput && !foundProduct && !isLoading) {
      const timer = setTimeout(() => {
        startScanner();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isOpen, showManualInput, foundProduct, isLoading, startScanner]);

  // Очищення при закритті
  useEffect(() => {
    if (!isOpen) {
      const cleanup = async () => {
        if (html5QrCodeRef.current) {
          if (isScanningRef.current) {
            try {
              await html5QrCodeRef.current.stop();
            } catch (e) {}
          }
          try {
            html5QrCodeRef.current.clear();
          } catch (e) {}
          html5QrCodeRef.current = null;
        }
        isScanningRef.current = false;
        isTransitioningRef.current = false;
      };
      cleanup();
    }
  }, [isOpen]);

  const handleManualSearch = async () => {
    const barcode = normalizeBarcode(manualBarcode);

    if (!barcode) {
      toast?.warning('Введіть штрих-код');
      return;
    }

    if (!isValidBarcode(barcode)) {
      toast?.warning('Підтримуються EAN-8, EAN-13 та UPC-A коди');
      return;
    }

    await searchProduct(barcode);
  };

  const handleAddProduct = () => {
    if (foundProduct) {
      onProductFound(foundProduct);
      handleClose();
    }
  };

  const handleClose = () => {
    stopScanner();
    setFoundProduct(null);
    setError(null);
    setManualBarcode('');
    setShowManualInput(false);
    setScannerReady(false);
    onClose();
  };

  const handleRetry = async () => {
    setFoundProduct(null);
    setError(null);
    if (showManualInput) {
      setManualBarcode('');
    } else {
      await stopScanner();
      setTimeout(startScanner, 400);
    }
  };

  const switchToCamera = async () => {
    await stopScanner();
    setShowManualInput(false);
    setError(null);
    setTimeout(startScanner, 400);
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleClose} position="top">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* iOS Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <button
            onClick={handleClose}
            className="text-[#007AFF] font-medium text-[17px] min-w-[70px]"
          >
            Закрити
          </button>
          <div className="flex items-center gap-2">
            <Scan size={20} className="text-[#007AFF]" />
            <span className="font-semibold text-[17px] text-black">Сканер</span>
          </div>
          <button
            onClick={showManualInput ? switchToCamera : () => {
              stopScanner();
              setShowManualInput(true);
            }}
            className="text-[#007AFF] font-medium text-[15px] min-w-[70px] text-right"
          >
            {showManualInput ? 'Камера' : 'Вручну'}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#F2F2F7]">
          {/* Результат сканування */}
          {foundProduct ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-[#34C759]">
                <CheckCircle2 size={20} />
                <span className="font-medium text-[15px]">Продукт знайдено!</span>
              </div>

              <div className="bg-white rounded-2xl p-4 space-y-3">
                {foundProduct.imageUrl && (
                  <img
                    src={foundProduct.imageUrl}
                    alt={foundProduct.name}
                    className="w-20 h-20 object-contain mx-auto rounded-xl bg-[#F2F2F7]"
                  />
                )}

                <div className="text-center">
                  <h3 className="text-black font-semibold text-[17px] capitalize">
                    {foundProduct.name}
                  </h3>
                  {foundProduct.brand && (
                    <p className="text-[#8E8E93] text-[13px]">{foundProduct.brand}</p>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-2 pt-2">
                  <div className="text-center p-2 bg-[#F2F2F7] rounded-xl">
                    <p className="text-[#8E8E93] text-[11px]">Калорії</p>
                    <p className="text-black font-semibold text-[15px]">{foundProduct.cal}</p>
                  </div>
                  <div className="text-center p-2 bg-[#F2F2F7] rounded-xl">
                    <p className="text-[#8E8E93] text-[11px]">Білки</p>
                    <p className="text-[#FF3B30] font-semibold text-[15px]">{foundProduct.p}г</p>
                  </div>
                  <div className="text-center p-2 bg-[#F2F2F7] rounded-xl">
                    <p className="text-[#8E8E93] text-[11px]">Жири</p>
                    <p className="text-[#FF9500] font-semibold text-[15px]">{foundProduct.f}г</p>
                  </div>
                  <div className="text-center p-2 bg-[#F2F2F7] rounded-xl">
                    <p className="text-[#8E8E93] text-[11px]">Вуглев.</p>
                    <p className="text-[#007AFF] font-semibold text-[15px]">{foundProduct.c}г</p>
                  </div>
                </div>

                <p className="text-[#8E8E93] text-[11px] text-center">
                  * на 100г продукту
                </p>

                {!foundProduct.hasNutritionData && (
                  <div className="bg-[#FF9500]/10 text-[#FF9500] text-[13px] p-3 rounded-xl text-center">
                    ⚠️ БЖВ не знайдено в базі. Заповніть вручну.
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRetry}
                  className="flex-1 py-3 rounded-xl bg-white text-[#007AFF] font-semibold text-[15px] active:opacity-80"
                >
                  Сканувати інший
                </button>
                <button
                  onClick={handleAddProduct}
                  className="flex-1 py-3 rounded-xl bg-[#34C759] text-white font-semibold text-[15px] active:opacity-80"
                >
                  Додати
                </button>
              </div>
            </div>
          ) : isLoading ? (
            /* Завантаження */
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 text-[#007AFF] animate-spin" />
              <p className="text-[#8E8E93] text-[15px]">Шукаю продукт...</p>
            </div>
          ) : error ? (
            /* Помилка */
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4">
                <div className="flex items-center gap-2 text-[#FF3B30] mb-3">
                  <AlertCircle size={20} />
                  <span className="text-[15px] font-medium">Помилка</span>
                </div>
                <p className="text-[#8E8E93] text-[13px]">{error}</p>
              </div>

              {!showManualInput && (
                <button
                  onClick={() => setShowManualInput(true)}
                  className="w-full py-3 rounded-xl bg-white text-[#007AFF] font-semibold text-[15px] active:opacity-80"
                >
                  Ввести код вручну
                </button>
              )}

              <button
                onClick={handleRetry}
                className="w-full py-3 rounded-xl bg-[#007AFF] text-white font-semibold text-[15px] active:opacity-80"
              >
                Спробувати ще
              </button>
            </div>
          ) : showManualInput ? (
            /* Ручне введення */
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4">
                <label className="block text-[13px] text-[#8E8E93] mb-2">Штрих-код з упаковки</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Наприклад: 4820024790017 або 036000291452"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[15px] text-center tracking-wider focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                  autoFocus
                />
                <p className="text-[11px] text-[#8E8E93] mt-2">
                  Підтримуються EAN-8, EAN-13 та UPC-A коди.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={switchToCamera}
                  className="flex-1 py-3 rounded-xl bg-white text-[#007AFF] font-semibold text-[15px] flex items-center justify-center gap-2 active:opacity-80"
                >
                  <Camera size={18} />
                  Камера
                </button>
                <button
                  onClick={handleManualSearch}
                  disabled={!manualBarcode}
                  className="flex-1 py-3 rounded-xl bg-[#007AFF] text-white font-semibold text-[15px] disabled:opacity-50 active:opacity-80"
                >
                  Знайти
                </button>
              </div>
            </div>
          ) : (
            /* Сканер */
            <div className="space-y-4">
              <div className="bg-white rounded-2xl overflow-hidden">
                <div
                  id="barcode-scanner"
                  className="w-full bg-black"
                  style={{ minHeight: '280px' }}
                />
              </div>

              {!scannerReady ? (
                <div className="flex items-center justify-center gap-2 text-[#8E8E93]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[13px]">Запускаю камеру...</span>
                </div>
              ) : (
                <p className="text-[#8E8E93] text-center text-[13px]">
                  Наведіть камеру на штрих-код продукту
                </p>
              )}

              <button
                onClick={() => {
                  stopScanner();
                  setShowManualInput(true);
                }}
                className="w-full py-3 rounded-xl bg-white text-[#007AFF] font-semibold text-[15px] active:opacity-80"
              >
                Ввести код вручну
              </button>
            </div>
          )}
        </div>
      </div>
    </AnimatedModal>
  );
};

export default BarcodeScannerModal;
