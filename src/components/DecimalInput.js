import React, {useEffect,useState} from 'react';
import {parseDecimal} from '../services/mealItems';
// Залишаємо кому під час набору: перетворення в число не повинно з'їдати «0,».
export default function DecimalInput({ value, onChange, ...props }) {
  const [raw, setRaw] = useState(value == null ? "" : String(value));
  useEffect(() => {
    if (parseDecimal(raw) !== value) setRaw(value == null ? "" : String(value));
  }, [value, raw]);
  return (
    <input
      {...props}
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(e);
      }}
    />
  );
}

