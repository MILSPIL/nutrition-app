import React from 'react';

// Skeleton компонент для анімованого плейсхолдера
const Skeleton = ({ className }) => (
  <div
    className={`animate-pulse bg-gray-200 rounded ${className}`}
    style={{ animationDuration: '1.5s' }}
  />
);

export default function LoadingScreen() {
  return (
    <div className="min-h-screen p-4" style={{ fontFamily: 'Montserrat', backgroundColor: '#f2f0eb' }}>
      {/* Header skeleton */}
      <div className="max-w-4xl mx-auto mb-6 bg-white rounded-lg shadow p-4">
        {/* Top row: name + weight + logout */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="w-24 h-5" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-4 h-4" />
          </div>
        </div>

        {/* Second row: Day + settings */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="w-12 h-5" />
            <Skeleton className="w-8 h-8" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
        </div>

        {/* Macros skeleton */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Skeleton className="w-28 h-4 mb-2" />
              <Skeleton className="w-32 h-7" />
            </div>
            <div className="text-right space-y-1">
              <Skeleton className="w-20 h-3" />
              <Skeleton className="w-20 h-3" />
            </div>
          </div>
        </div>

        {/* Meal buttons skeleton */}
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(num => (
            <Skeleton key={num} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>

      {/* Meal section skeleton */}
      <div className="max-w-4xl mx-auto mb-6 bg-white rounded-lg shadow p-4">
        <Skeleton className="w-32 h-6 mb-4" />

        {[1, 2, 3].map(i => (
          <div key={i} className="mb-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <Skeleton className="w-8 h-10" />
                </div>
                <Skeleton className="w-24 h-4" />
              </div>
              <Skeleton className="w-24 h-8 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Activity section skeleton */}
      <div className="max-w-4xl mx-auto mb-6 bg-white rounded-lg shadow p-4">
        <Skeleton className="w-40 h-6 mb-4" />
        <Skeleton className="w-full h-10 mb-3 rounded" />
        <Skeleton className="w-full h-10 rounded" />
      </div>

      {/* Button skeleton */}
      <div className="max-w-4xl mx-auto">
        <Skeleton className="w-full h-12 rounded-lg" />
      </div>
    </div>
  );
}
