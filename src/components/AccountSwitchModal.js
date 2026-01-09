import React from 'react';
import { X } from 'lucide-react';
import AnimatedModal from './AnimatedModal';

export default function AccountSwitchModal({
  isOpen,
  onClose,
  users,
  currentUser,
  onSelectUser,
  onAddAccount
}) {
  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Акаунти</h3>
          <button onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {Object.entries(users).map(([userId, user]) => (
            <button
              key={userId}
              onClick={() => onSelectUser(userId)}
              className={`w-full p-3 rounded-lg text-left ${
                userId === currentUser ? 'bg-blue-100 border-2 border-blue-500' : 'bg-gray-100'
              }`}
            >
              <div className="font-semibold">{user.name}</div>
              <div className="text-sm text-gray-600">День {user.programDay}</div>
            </button>
          ))}
        </div>

        <button
          onClick={onAddAccount}
          className="w-full py-2 bg-green-500 text-white rounded-lg"
        >
          + Додати акаунт
        </button>
      </div>
    </AnimatedModal>
  );
}
