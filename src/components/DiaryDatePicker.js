import React, { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { dateLabel } from '../services/trainerDates';
import './DiaryDatePicker.css';
export default function DiaryDatePicker({ value, today, yesterday, disabled, onSelect }) {
  const menu = useRef(null);
  const summary = useRef(null);
  function choose(date) {
    if (!date || disabled) return;
    onSelect(date);
    menu.current.open = false;
    summary.current.focus();
  }
  return <details ref={menu} className="diary-header-date" onKeyDown={e => {if(e.key === 'Escape'){e.stopPropagation();menu.current.open=false;summary.current.focus();}}}>
    <summary ref={summary} aria-label={`Історія харчування: ${dateLabel(value)}`} aria-disabled={disabled} onClick={e => {if(disabled)e.preventDefault();}}>
      <CalendarDays size={18} aria-hidden="true"/><span>{dateLabel(value).slice(0,5)}</span>
    </summary>
    <div className="diary-header-calendar">
      <p>Історія харчування</p>
      <div><button type="button" aria-pressed={value===today} disabled={disabled} onClick={()=>choose(today)}>Сьогодні</button><button type="button" aria-pressed={value===yesterday} disabled={disabled} onClick={()=>choose(yesterday)}>Вчора</button></div>
      <label>Обрати день<input type="date" aria-label="Дата записів" value={value} disabled={disabled} onChange={e=>choose(e.target.value)}/></label>
    </div>
  </details>;
}
