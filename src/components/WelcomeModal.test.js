import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import WelcomeModal, { APP_VERSION } from './WelcomeModal';

jest.mock('./AnimatedModal', () => ({ isOpen, children }) => isOpen ? children : null);
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
const render = async () => act(async () => root.render(<WelcomeModal userName="Юрій" />));
const close = async () => act(async () => Simulate.click([...container.querySelectorAll('button')].find(node => node.textContent === 'Почати!')));
beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

test('показує одну людську версію та поточні новини', async () => {
  await render();
  expect(APP_VERSION).toBe('1.9.0');
  expect(require('../../package.json').version).toBe(APP_VERSION);
  expect(container.textContent).toContain(`Версія ${APP_VERSION}`);
  expect(container.textContent).toContain(`Що нового у v${APP_VERSION}`);
  expect(container.textContent).toContain('Запис починається після кнопки «Почати запис»');
  expect(container.textContent).toContain('ntzg.pp.ua');
  expect(container.textContent).not.toContain('ntzg.fun');
});

test('закриті новини не повторюються після повторного входу чи технічної збірки', async () => {
  await render();
  await close();
  expect(localStorage.getItem('app_version_seen')).toBe(APP_VERSION);
  await act(async () => root.unmount());
  root = createRoot(container);
  const previous = process.env.REACT_APP_VERSION;
  process.env.REACT_APP_VERSION = 'bad8217421d0eff859b920885d849e3e121cbf72';
  try {
    await render();
    expect(container.textContent).toBe('');
  } finally { process.env.REACT_APP_VERSION = previous; }
});

test('попередня версія отримує новини без втрати інших локальних даних', async () => {
  localStorage.setItem('app_version_seen', '1.6.0');
  localStorage.setItem('existing-user-preference', 'keep');
  await render();
  expect(container.textContent).toContain('Що нового у v1.9.0');
  await close();
  expect(localStorage.getItem('existing-user-preference')).toBe('keep');
});

test('відмова сховища не блокує відкриття й закриття новин', async () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  await render();
  expect(container.textContent).toContain('Що нового у v1.9.0');
  await close();
  expect(container.textContent).toBe('');
});

test('навіть SHA у build environment не стає видимою версією', () => {
  const previous = process.env.REACT_APP_VERSION;
  process.env.REACT_APP_VERSION = 'bad8217421d0eff859b920885d849e3e121cbf72';
  try {
    jest.isolateModules(() => {
      expect(require('./WelcomeModal').APP_VERSION).toBe('1.9.0');
    });
  } finally {
    if (previous === undefined) delete process.env.REACT_APP_VERSION;
    else process.env.REACT_APP_VERSION = previous;
  }
});
