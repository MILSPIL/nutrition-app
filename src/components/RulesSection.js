import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';

export default function RulesSection() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="max-w-lg mx-auto px-4 mt-4">
      <div className="bg-white rounded-2xl overflow-hidden">
        {/* Header - clickable */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between active:bg-[#F2F2F7]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#007AFF]/10 rounded-xl flex items-center justify-center">
              <Info size={20} className="text-[#007AFF]" />
            </div>
            <span className="text-[17px] font-semibold text-black">Важливі правила</span>
          </div>
          {isExpanded ? (
            <ChevronUp size={20} className="text-[#C7C7CC]" />
          ) : (
            <ChevronDown size={20} className="text-[#C7C7CC]" />
          )}
        </button>

        {/* Content - collapsible */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-1">
            <div className="text-[15px] text-[#3C3C43] space-y-3">
              <p className="font-medium">
                З кожної літери виберіть щось одне (можна їсти два продукти по 50% кожен).
              </p>

              <div className="flex items-start gap-2 text-[#34C759]">
                <span>✓</span>
                <span>Соєвий соус і спеції можна.</span>
              </div>

              <div className="mt-3">
                <p className="font-medium text-black mb-2">Можна проводити будь-які ротації:</p>
                <ul className="space-y-2 text-[#3C3C43]">
                  <li className="flex items-start gap-2">
                    <span className="text-[#34C759]">✓</span>
                    <span>Міняти прийоми їжі місцями</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#34C759]">✓</span>
                    <span>Зменшувати/збільшувати кількість прийомів їжі</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#34C759]">✓</span>
                    <span>Брати продукт з одного прийому їжі і переставляти в інший</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
