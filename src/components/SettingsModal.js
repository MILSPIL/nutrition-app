import React, { useState, useEffect, useCallback } from 'react';
import { X, Calendar, UserMinus, UserPlus, Settings as SettingsIcon, ChevronRight, Check, Clock, Trash2, LogOut } from 'lucide-react';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import AnimatedModal from './AnimatedModal';
import { toast } from './Toast';
import { getDateInputMax } from '../utils/date';

export default function SettingsModal({
  isOpen,
  onClose,
  firebaseUser,
  currentStartDate,
  onStartDateSave,
  calculateCurrentDay,
  onShowPortionSettings,
  onShowAddTrainer,
  onSignOut
}) {
  const [activeSection, setActiveSection] = useState(null); // 'startDate' | 'trainer' | null
  const [tempStartDate, setTempStartDate] = useState("");

  // Trainer state
  const [loading, setLoading] = useState(false);
  const [currentTrainer, setCurrentTrainer] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);

  // Load trainer state
  const loadTrainerState = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      // Check if has trainer
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.trainerId) {
          const trainerDoc = await getDoc(doc(db, 'trainers', data.trainerId));
          if (trainerDoc.exists()) {
            setCurrentTrainer({
              id: data.trainerId,
              email: data.trainerEmail,
              ...trainerDoc.data().profile
            });
          }
        } else {
          setCurrentTrainer(null);
        }
      }

      // Check pending requests
      const requestsQuery = query(
        collection(db, 'trainerRequests'),
        where('clientId', '==', firebaseUser.uid),
        where('status', '==', 'pending')
      );
      const requestsSnapshot = await getDocs(requestsQuery);
      if (!requestsSnapshot.empty) {
        const req = requestsSnapshot.docs[0];
        setPendingRequest({ id: req.id, ...req.data() });
      } else {
        setPendingRequest(null);
      }
    } catch (err) {
      console.error('Error loading trainer state:', err);
    }
  }, [firebaseUser]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setActiveSection(null);
      setTempStartDate(currentStartDate || "");
      loadTrainerState();
    }
  }, [isOpen, currentStartDate, loadTrainerState]);

  // Save start date
  const handleSaveStartDate = () => {
    if (!tempStartDate) {
      toast.warning('Вкажіть дату початку!');
      return;
    }
    onStartDateSave(tempStartDate);
    setActiveSection(null);
    toast.success('Дату збережено');
  };

  // Disconnect from trainer
  const handleDisconnectTrainer = async () => {
    if (!currentTrainer || !firebaseUser) return;

    setLoading(true);
    try {
      // Remove client from trainer's list
      const trainerRef = doc(db, 'trainers', currentTrainer.id);
      const trainerDoc = await getDoc(trainerRef);
      if (trainerDoc.exists()) {
        const clients = trainerDoc.data().clients || {};
        delete clients[firebaseUser.uid];
        await updateDoc(trainerRef, { clients });
      }

      // Clear trainerId in user profile
      const userRef = doc(db, 'users', firebaseUser.uid);
      await updateDoc(userRef, {
        trainerId: null,
        trainerEmail: null
      });

      setCurrentTrainer(null);
      toast.success('Тренера видалено');
    } catch (err) {
      console.error('Error disconnecting:', err);
      toast.error('Помилка видалення');
    } finally {
      setLoading(false);
    }
  };

  // Cancel pending request
  const handleCancelRequest = async () => {
    if (!pendingRequest) return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'trainerRequests', pendingRequest.id));
      setPendingRequest(null);
      toast.success('Запит скасовано');
    } catch (err) {
      console.error('Error canceling request:', err);
      toast.error('Помилка скасування');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setActiveSection(null);
    onClose();
  };

  // Main menu
  const renderMainMenu = () => (
    <div className="space-y-2">
      {/* Start Date */}
      <button
        onClick={() => setActiveSection('startDate')}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#F2F2F7] rounded-xl active:bg-[#E5E5EA]"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#007AFF]/10 rounded-lg flex items-center justify-center">
            <Calendar size={18} className="text-[#007AFF]" />
          </div>
          <div className="text-left">
            <div className="text-[15px] font-medium text-black">Дата початку програми</div>
            <div className="text-[13px] text-[#8E8E93]">
              {currentStartDate
                ? new Date(currentStartDate).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : 'Не вказано'}
            </div>
          </div>
        </div>
        <ChevronRight size={18} className="text-[#C7C7CC]" />
      </button>

      {/* Trainer */}
      <button
        onClick={() => setActiveSection('trainer')}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#F2F2F7] rounded-xl active:bg-[#E5E5EA]"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#34C759]/10 rounded-lg flex items-center justify-center">
            <UserMinus size={18} className="text-[#34C759]" />
          </div>
          <div className="text-left">
            <div className="text-[15px] font-medium text-black">Тренер</div>
            <div className="text-[13px] text-[#8E8E93]">
              {currentTrainer
                ? currentTrainer.email
                : pendingRequest
                  ? 'Очікує підтвердження'
                  : 'Не підключено'}
            </div>
          </div>
        </div>
        <ChevronRight size={18} className="text-[#C7C7CC]" />
      </button>

      {/* Portions */}
      <button
        onClick={() => {
          handleClose();
          onShowPortionSettings();
        }}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#F2F2F7] rounded-xl active:bg-[#E5E5EA]"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#FF9500]/10 rounded-lg flex items-center justify-center">
            <SettingsIcon size={18} className="text-[#FF9500]" />
          </div>
          <div className="text-left">
            <div className="text-[15px] font-medium text-black">Налаштування порцій</div>
            <div className="text-[13px] text-[#8E8E93]">Індивідуальні норми</div>
          </div>
        </div>
        <ChevronRight size={18} className="text-[#C7C7CC]" />
      </button>

      {/* Add Trainer */}
      {!currentTrainer && !pendingRequest && (
        <button
          onClick={() => {
            handleClose();
            onShowAddTrainer();
          }}
          className="w-full flex items-center justify-between px-4 py-3 bg-[#F2F2F7] rounded-xl active:bg-[#E5E5EA]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#5856D6]/10 rounded-lg flex items-center justify-center">
              <UserPlus size={18} className="text-[#5856D6]" />
            </div>
            <div className="text-left">
              <div className="text-[15px] font-medium text-black">Додати тренера</div>
              <div className="text-[13px] text-[#8E8E93]">Надіслати запит</div>
            </div>
          </div>
          <ChevronRight size={18} className="text-[#C7C7CC]" />
        </button>
      )}

      {/* Sign Out */}
      <button
        onClick={() => {
          handleClose();
          onSignOut();
        }}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#FF3B30]/10 rounded-xl active:bg-[#FF3B30]/20 mt-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#FF3B30]/10 rounded-lg flex items-center justify-center">
            <LogOut size={18} className="text-[#FF3B30]" />
          </div>
          <div className="text-left">
            <div className="text-[15px] font-medium text-[#FF3B30]">Вийти з акаунта</div>
            <div className="text-[13px] text-[#FF3B30]/60">{firebaseUser?.email}</div>
          </div>
        </div>
      </button>
    </div>
  );

  // Start date section
  const renderStartDateSection = () => (
    <div>
      <button
        onClick={() => setActiveSection(null)}
        className="flex items-center gap-2 text-[#007AFF] mb-4"
      >
        <ChevronRight size={18} className="rotate-180" />
        <span className="text-[15px]">Назад</span>
      </button>

      <div className="space-y-4">
        <div>
          <label className="block text-[13px] text-[#8E8E93] mb-2 px-1">
            Дата початку програми
          </label>
          <input
            type="date"
            value={tempStartDate}
            onChange={(e) => setTempStartDate(e.target.value)}
            max={getDateInputMax()}
            className="w-full px-4 py-3 bg-[#F2F2F7] rounded-xl text-[17px] text-center focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
          />
        </div>

        {tempStartDate && (
          <div className="bg-[#34C759]/10 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Check size={18} className="text-[#34C759]" />
              <span className="text-[15px] text-[#34C759] font-medium">
                День програми: {calculateCurrentDay(tempStartDate)}
              </span>
            </div>
          </div>
        )}

        <div className="bg-[#007AFF]/10 rounded-xl p-4">
          <p className="text-[13px] text-[#007AFF]">
            День програми розраховується автоматично від вказаної дати.
          </p>
        </div>

        <button
          onClick={handleSaveStartDate}
          className="w-full py-3 bg-[#34C759] text-white rounded-xl text-[17px] font-semibold active:opacity-80"
        >
          Зберегти
        </button>
      </div>
    </div>
  );

  // Trainer section
  const renderTrainerSection = () => (
    <div>
      <button
        onClick={() => setActiveSection(null)}
        className="flex items-center gap-2 text-[#007AFF] mb-4"
      >
        <ChevronRight size={18} className="rotate-180" />
        <span className="text-[15px]">Назад</span>
      </button>

      {/* Current trainer */}
      {currentTrainer && (
        <div className="bg-[#34C759]/10 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#34C759]/20 rounded-full flex items-center justify-center">
                <Check size={20} className="text-[#34C759]" />
              </div>
              <div>
                <div className="text-[15px] font-semibold text-black">
                  {currentTrainer.name || 'Тренер'}
                </div>
                <div className="text-[13px] text-[#8E8E93]">{currentTrainer.email}</div>
              </div>
            </div>
            <button
              onClick={handleDisconnectTrainer}
              disabled={loading}
              className="p-2 text-[#FF3B30] active:opacity-50"
              title="Відключитись"
            >
              <Trash2 size={20} />
            </button>
          </div>
          <p className="text-[13px] text-[#34C759] mt-3">
            Тренер бачить ваше харчування
          </p>
        </div>
      )}

      {/* Pending request */}
      {pendingRequest && !currentTrainer && (
        <div className="bg-[#FF9500]/10 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#FF9500]/20 rounded-full flex items-center justify-center">
                <Clock size={20} className="text-[#FF9500]" />
              </div>
              <div>
                <div className="text-[15px] font-semibold text-black">Очікує підтвердження</div>
                <div className="text-[13px] text-[#8E8E93]">{pendingRequest.trainerEmail}</div>
              </div>
            </div>
            <button
              onClick={handleCancelRequest}
              disabled={loading}
              className="p-2 text-[#FF3B30] active:opacity-50"
            >
              <X size={20} />
            </button>
          </div>
          <p className="text-[13px] text-[#FF9500] mt-3">
            Тренер має підтвердити запит
          </p>
        </div>
      )}

      {/* No trainer */}
      {!currentTrainer && !pendingRequest && (
        <div className="bg-[#F2F2F7] rounded-xl p-4">
          <p className="text-[15px] text-[#8E8E93] text-center">
            Тренер не підключено
          </p>
          <p className="text-[13px] text-[#C7C7CC] text-center mt-2">
            Натисніть кнопку "Тренер" в панелі щоб надіслати запит
          </p>
        </div>
      )}

      {/* Info */}
      <div className="mt-4 pt-4 border-t border-[#C6C6C8]/30">
        <p className="text-[13px] text-[#8E8E93]">
          Тренер може бачити:
        </p>
        <ul className="text-[13px] text-[#8E8E93] mt-2 space-y-1">
          <li>• Ваші прийоми їжі</li>
          <li>• Історію за всі дні</li>
          <li>• Активність та БЖВ</li>
          <li>• Заміри тіла</li>
        </ul>
      </div>
    </div>
  );

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleClose}>
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <h2 className="text-[17px] font-semibold text-black">Налаштування</h2>
          <button
            onClick={handleClose}
            className="p-1 text-[#007AFF] active:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {activeSection === null && renderMainMenu()}
          {activeSection === 'startDate' && renderStartDateSection()}
          {activeSection === 'trainer' && renderTrainerSection()}
        </div>
      </div>
    </AnimatedModal>
  );
}
