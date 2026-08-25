import React from 'react';
import { X, LogOut, User, Mail } from 'lucide-react';
import AnimatedModal from './AnimatedModal';

export default function AccountSwitchModal({
  isOpen,
  onClose,
  users,
  currentUser,
  firebaseUser,
  onSignOut
}) {
  const user = users[currentUser];

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
          <h3 className="text-[17px] font-semibold text-black">Акаунт</h3>
          <button onClick={onClose} className="p-1 text-[#007AFF] active:opacity-50">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* User Info */}
          <div className="bg-[#F2F2F7] rounded-xl p-4 mb-4">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 bg-[#007AFF]/10 rounded-full flex items-center justify-center overflow-hidden">
                {firebaseUser?.photoURL ? (
                  <img
                    src={firebaseUser.photoURL}
                    alt="Avatar"
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <User size={32} className="text-[#007AFF]" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="text-[17px] font-semibold text-black">
                  {user?.name || 'Користувач'}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Mail size={14} className="text-[#8E8E93]" />
                  <span className="text-[13px] text-[#8E8E93]">
                    {firebaseUser?.email || 'email@example.com'}
                  </span>
                </div>
                <div className="text-[13px] text-[#007AFF] mt-1">
                  День {user?.programDay || 1}
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[#F2F2F7] rounded-xl p-3 text-center">
              <div className="text-[22px] font-bold text-[#007AFF]">
                {user?.programDay || 1}
              </div>
              <div className="text-[13px] text-[#8E8E93]">днів на програмі</div>
            </div>
            <div className="bg-[#F2F2F7] rounded-xl p-3 text-center">
              <div className="text-[22px] font-bold text-[#34C759]">
                {user?.currentWeight || 'Немає'}
              </div>
              <div className="text-[13px] text-[#8E8E93]">поточна вага</div>
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#FF3B30]/10 text-[#FF3B30] rounded-xl text-[17px] font-medium active:bg-[#FF3B30]/20"
          >
            <LogOut size={20} />
            <span>Вийти з акаунта</span>
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}
