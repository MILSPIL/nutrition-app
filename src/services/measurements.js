export const MEASUREMENT_PARAMS = [
  { key: 'weight', label: 'Вага', unit: 'кг', step: 0.1, icon: '⚖️' },
  { key: 'waist', label: 'Талія', unit: 'см', step: 1, icon: '📏' },
  { key: 'hips', label: 'Стегна', unit: 'см', step: 1, icon: '📏' },
  { key: 'chest', label: 'Груди', unit: 'см', step: 1, icon: '📏' },
  { key: 'arms', label: 'Руки', unit: 'см', step: 1, icon: '💪' },
  { key: 'thighs', label: 'Ноги', unit: 'см', step: 1, icon: '🦵' }
];

export const calculateMeasurementDiff = (current, previous) => {
  if (current === undefined || previous === undefined) {
    return null;
  }

  return Math.round((current - previous) * 10) / 10;
};

export const getMeasurementComparison = (measurements) => {
  if (!Array.isArray(measurements) || measurements.length === 0) {
    return null;
  }

  const ordered = [...measurements].sort((left, right) => {
    return String(left.date || left.id).localeCompare(String(right.date || right.id));
  });

  return {
    initial: ordered[0],
    previous: ordered.length > 1 ? ordered[ordered.length - 2] : null,
    current: ordered[ordered.length - 1]
  };
};

