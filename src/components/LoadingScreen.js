import React from 'react';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center">
      {/* Logo */}
      <div className="animate-pulse">
        <img
          src="/logo.svg"
          alt="SciSense"
          className="w-32 h-32 mb-6"
        />
      </div>

      {/* App name */}
      <h1 className="text-[24px] font-bold text-black mb-2">
        <span className="text-[#007AFF]">Sci</span>Sense
      </h1>

      {/* Tagline */}
      <p className="text-[15px] text-[#8E8E93] mb-8">
        Наука та Здоровий Глузд
      </p>

      {/* Loading indicator */}
      <div className="flex gap-1">
        <div
          className="w-2 h-2 bg-[#007AFF] rounded-full animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <div
          className="w-2 h-2 bg-[#34C759] rounded-full animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <div
          className="w-2 h-2 bg-[#007AFF] rounded-full animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  );
}
