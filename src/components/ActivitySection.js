import React from 'react';
import { Footprints, Dumbbell } from 'lucide-react';

export default function ActivitySection({
  activity,
  otherActivity,
  onActivityChange,
  onOtherActivityChange
}) {
  return (
    <div className="max-w-lg mx-auto px-4 mt-4">
      <div className="bg-white rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#C6C6C8]/30">
          <h2 className="text-[17px] font-semibold text-black">Рухова активність</h2>
        </div>

        {/* Steps input */}
        <div className="px-4 py-3 border-b border-[#C6C6C8]/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FF9500]/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Footprints size={20} className="text-[#FF9500]" />
            </div>
            <div className="flex-1">
              <div className="text-[13px] text-[#8E8E93] mb-1">Кроки</div>
              <input
                type="text"
                value={activity}
                onChange={(e) => onActivityChange(e.target.value)}
                placeholder="напр. 9000 кроків"
                className="w-full px-3 py-2 bg-[#F2F2F7] rounded-lg text-[15px] text-black placeholder-[#C7C7CC] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
            </div>
          </div>
        </div>

        {/* Other activity input */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#007AFF]/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Dumbbell size={20} className="text-[#007AFF]" />
            </div>
            <div className="flex-1">
              <div className="text-[13px] text-[#8E8E93] mb-1">Інша активність</div>
              <input
                type="text"
                value={otherActivity}
                onChange={(e) => onOtherActivityChange(e.target.value)}
                placeholder="напр. зал 1 година"
                className="w-full px-3 py-2 bg-[#F2F2F7] rounded-lg text-[15px] text-black placeholder-[#C7C7CC] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
