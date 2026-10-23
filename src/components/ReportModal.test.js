import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import ReportModal from './ReportModal';

jest.mock('./AnimatedModal', () => ({ isOpen, children }) => isOpen ? children : null);
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, props;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const render = async (patch = {}) => {
  Object.assign(props, patch);
  await act(async () => root.render(<ReportModal {...props} />));
};
const copy = () => [...container.querySelectorAll('button')].find(node => /Копіювати/.test(node.textContent));
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  props = { isOpen: true, onClose: jest.fn(), report: '2026-10-23 · День 2\nТестовий кефір (200 г; 106 ккал)' };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn() } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

test('прев’ю незмінне, немає поля або транспорту Telegram', async () => {
  await render();
  expect(container.querySelector('pre').textContent).toBe(props.report);
  expect(container.textContent).toContain('Звіт про харчування');
  expect(container.textContent).not.toContain('Telegram');
  expect(container.querySelector('input')).toBeNull();
});

test('успіх показаний лише після фактичного завершення копіювання', async () => {
  const pending = deferred();
  navigator.clipboard.writeText.mockReturnValue(pending.promise);
  await render();
  const node = copy();
  await act(async () => Simulate.click(node));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(props.report);
  expect(container.textContent).not.toContain('Скопійовано');
  expect(node.disabled).toBe(true);
  await act(async () => pending.resolve());
  expect(container.textContent).toContain('Скопійовано');
});

test('відмова clipboard не видається за успіх і дозволяє повтор', async () => {
  navigator.clipboard.writeText.mockRejectedValue(Error('denied'));
  await render();
  await act(async () => Simulate.click(copy()));
  expect(container.querySelector('[role="alert"]').textContent).toContain('Не вдалося скопіювати');
  expect(container.textContent).not.toContain('Скопійовано');
  expect(copy().disabled).toBe(false);
  navigator.clipboard.writeText.mockResolvedValue();
  await act(async () => Simulate.click(copy()));
  expect(container.textContent).toContain('Скопійовано');
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test('без clipboard лишається текст для ручного копіювання', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  await render();
  await act(async () => Simulate.click(copy()));
  expect(container.querySelector('[role="alert"]').textContent).toContain('виділіть текст');
  expect(container.querySelector('pre').textContent).toBe(props.report);
});

test('пізня відповідь для попереднього звіту не позначає новий скопійованим', async () => {
  const pending = deferred();
  navigator.clipboard.writeText.mockReturnValue(pending.promise);
  await render();
  await act(async () => Simulate.click(copy()));
  await render({ report: '2026-10-24 · Інший звіт' });
  await act(async () => pending.resolve());
  expect(container.textContent).not.toContain('Скопійовано');
  expect(container.querySelector('pre').textContent).toBe(props.report);
});

test('закриття скасовує тільки індикацію, нове відкриття не показує старий успіх', async () => {
  const pending = deferred();
  navigator.clipboard.writeText.mockReturnValue(pending.promise);
  const open = jest.spyOn(window, 'open').mockImplementation(() => {});
  await render();
  const button = copy();
  await act(async () => { Simulate.click(button); Simulate.click(button); });
  expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  await render({ isOpen: false });
  await act(async () => pending.resolve());
  await render({ isOpen: true });
  expect(container.textContent).not.toContain('Скопійовано');
  expect(open).not.toHaveBeenCalled();
});
