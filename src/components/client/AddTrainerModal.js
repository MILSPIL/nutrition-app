import React from 'react';
import { X, UserPlus } from 'lucide-react';
import AnimatedModal from '../AnimatedModal';
import TrainerConnectionPanel from './TrainerConnectionPanel';
import { useTrainerConnection } from '../../services/useTrainerConnection';
export default function AddTrainerModal({isOpen,onClose,firebaseUser,userName}) {
  const model=useTrainerConnection(firebaseUser,isOpen);
  return <AnimatedModal isOpen={isOpen} onClose={onClose}>
    <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#C6C6C8]/30">
        <div className="flex items-center gap-2"><UserPlus size={20} className="text-[#007AFF]"/><h2 className="text-[17px] font-semibold">Мій тренер</h2></div>
        <button onClick={onClose} aria-label="Закрити налаштування тренера" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#007AFF]"><X size={24}/></button>
      </div>
      <div className="p-4 overflow-y-auto max-h-[70vh]"><TrainerConnectionPanel model={model} userName={userName}/></div>
    </div>
  </AnimatedModal>;
}
