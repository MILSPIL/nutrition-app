import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import CategoryIcon from './CategoryIcon';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
const render = async (src) => act(async () => root.render(<CategoryIcon src={src} alt="Категорія" />));
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('після помилки замінює зламане зображення локальним значком без нових запитів', async () => {
  await render('/icons/missing.png');
  await act(async () => Simulate.error(container.querySelector('img')));
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('[role="img"]').getAttribute('aria-label')).toBe('Категорія');
  expect(container.querySelector('svg')).not.toBeNull();
  await render('/icons/category-carbs.png');
  expect(container.querySelector('img').getAttribute('src')).toBe('/icons/category-carbs.png');
});

test('категорія без URL не створює порожній запит зображення', async () => {
  await render(undefined);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('[role="img"]')).not.toBeNull();
});
