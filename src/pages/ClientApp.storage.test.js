import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import ClientApp from './ClientApp';
import MeasurementReminderModal from '../components/measurements/MeasurementReminderModal';
import { onAuthStateChanged } from 'firebase/auth';
import { getTodayDateKey } from '../utils/date';

jest.mock('../firebase', () => ({ auth: {}, db: {}, googleProvider: {}, IS_LOCAL_LAB: false, IS_PHONE_LAB: false }));
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((auth, callback) => { callback(null); return () => {}; }),
}));
jest.mock('firebase/firestore', () => ({}));
jest.mock('../components', () => ({
  LoadingScreen: () => null,
  LoginScreen: jest.requireActual('../components/LoginScreen').default,
}));
jest.mock('../components/AnimatedModal', () => ({ isOpen, children }) => isOpen ? children : null);
jest.mock('../components/VoiceInputModal', () => () => null);
jest.mock('../components/PilotPanel', () => () => null);
jest.mock('../services/useMealDay', () => ({ useMealDay: () => ({ day: { meals: {} }, ready: false }) }));
jest.mock('../services/pilotLedger', () => ({ createPilotLedger: () => ({ close: async () => {} }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => {
  localStorage.clear();
  onAuthStateChanged.mockImplementation((auth, callback) => { callback(null); return () => {}; });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  try { await act(async () => root.unmount()); }
  finally { container.remove(); jest.restoreAllMocks(); }
});

test('відмова optional reminder preference не перериває mount і Firebase Auth listener', async () => {
  const getItem = Storage.prototype.getItem;
  const read = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
    if (key === 'measurementReminderDismissed') throw Error('blocked_preference');
    return getItem.call(this, key);
  });
  await act(async () => root.render(<ClientApp />));
  expect(read).toHaveBeenCalledWith('measurementReminderDismissed');
  expect(onAuthStateChanged).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Увійти через Google');
});

test.each([false, true])('закриття нагадування працює при відмові сховища=%s', async (blocked) => {
  const setItem = Storage.prototype.setItem;
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (blocked && key === 'measurementReminderDismissed') throw Error('blocked_preference');
    return setItem.call(this, key, value);
  });
  const onClose = jest.fn(), onDismiss = jest.fn();
  await act(async () => root.render(<MeasurementReminderModal isOpen onClose={onClose} onDismiss={onDismiss} />));
  const later = [...container.querySelectorAll('button')].find(node => node.textContent === 'Нагадати пізніше');
  await act(async () => Simulate.click(later));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('measurementReminderDismissed')).toBe(blocked ? null : getTodayDateKey());
});
