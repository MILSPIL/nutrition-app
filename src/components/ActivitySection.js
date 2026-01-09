import React from 'react';

export default function ActivitySection({
  activity,
  otherActivity,
  onActivityChange,
  onOtherActivityChange
}) {
  return (
    <div className="max-w-4xl mx-auto mb-6 bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold mb-4">🏃 Рухова активність</h2>
      <div className="space-y-3">
        <input
          type="text"
          value={activity}
          onChange={(e) => onActivityChange(e.target.value)}
          placeholder="9000 кроків"
          className="w-full px-3 py-2 border rounded"
        />
        <input
          type="text"
          value={otherActivity}
          onChange={(e) => onOtherActivityChange(e.target.value)}
          placeholder="зал 1 година, прибирання"
          className="w-full px-3 py-2 border rounded"
        />
      </div>
    </div>
  );
}
