import React, { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import './TrainerLauncher.css';

export default function TrainerLauncher({ hidden = false, disabled = false, onOpen }) {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const active = document.activeElement;
      const editing = active?.matches?.('input:not([type="button"]):not([type="submit"]),textarea,[contenteditable="true"]');
      const keyboard = editing && (!viewport || window.innerHeight - viewport.height > 80 || window.innerWidth < 600);
      setCovered(document.body.style.overflow === 'hidden' || !!document.querySelector('[data-modal-surface]') || !!keyboard);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'], childList: true, subtree: true });
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return <button type="button" className="trainer-launcher" hidden={hidden || covered} disabled={disabled} aria-label="Відкрити тренера" aria-haspopup="dialog" onClick={onOpen}>
    <MessageCircle size={24} aria-hidden="true" />Тренер
  </button>;
}
