import NutritionTargetsSettings from './NutritionTargetsSettings';
import React, { useState, useEffect } from 'react';
import { X, Calendar, UserMinus, UserPlus, Settings as SettingsIcon, ChevronRight, Check, LogOut } from 'lucide-react';
import { useTrainerConnection } from '../services/useTrainerConnection';
import TrainerConnectionPanel from './client/TrainerConnectionPanel';
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
  onSignOut,
  profile,
  profileKey,
  onTargetsSave
}) {
  const [activeSection, setActiveSection] = useState(null); // 'startDate' | 'trainer' | null
  const [tempStartDate, setTempStartDate] = useState("");

  const trainer=useTrainerConnection(firebaseUser,isOpen);
  const {currentTrainer,pendingRequest}=trainer;

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setActiveSection(null);
      setTempStartDate(currentStartDate || "");
    }
  }, [isOpen, currentStartDate]);

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

  const handleClose = () => {
    setActiveSection(null);
    onClose();
  };

  // Main menu
  const renderMainMenu = () => (
    <div className="space-y-2">
      {onTargetsSave && <button onClick={() => setActiveSection('targets')} className="w-full flex items-center justify-between px-4 py-3 bg-[#F2F2F7] rounded-xl min-h-[48px] text-left"><span>Профіль і програма<br/><span className="text-[13px] text-[#8E8E93]">Особисті денні норми</span></span><ChevronRight size={18}/></button>}

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

      <TrainerConnectionPanel model={trainer} userName={firebaseUser?.displayName}/>
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
        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {activeSection === null && renderMainMenu()}
          {activeSection === 'startDate' && renderStartDateSection()}
          {activeSection === 'trainer' && renderTrainerSection()}
          {activeSection === 'targets' && <NutritionTargetsSettings key={profileKey} profile={profile} onSave={onTargetsSave} onBack={() => setActiveSection(null)}/>}
        </div>
      </div>
    </AnimatedModal>
  );
}
