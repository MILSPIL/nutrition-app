import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import DaySelectorModal from './DaySelectorModal';

jest.mock('./AnimatedModal', () => ({__esModule:true, default:({isOpen,children}) => isOpen ? <div>{children}</div> : null}));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, props;
const input = () => container.querySelector('input');
const button = text => [...container.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const render = async patch => {
  props = {...props,...patch};
  await act(async () => root.render(<DaySelectorModal {...props}/>));
};
const change = async value => act(async () => Simulate.change(input(), {target:{value}}));
beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  props = {isOpen:true, onClose:jest.fn(), programDay:7, onDayChange:jest.fn(), startDate:'2026-10-20', calculateCurrentDay:() => 7};
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('можна стерти 7 й набрати 6 без проміжного вибору дня 1', async () => {
  await change('');
  expect(input().value).toBe('');
  expect(props.onDayChange).not.toHaveBeenCalled();
  await change('6');
  expect(input().value).toBe('6');
  expect(props.onDayChange).not.toHaveBeenCalled();
  await act(async () => Simulate.click(button('Готово')));
  expect(props.onDayChange).toHaveBeenCalledTimes(1);
  expect(props.onDayChange).toHaveBeenCalledWith(6);
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('багатозначний день застосовується один раз після завершення введення', async () => {
  await render({programDay:27,calculateCurrentDay:() => 30});
  await change('');
  await change('1');
  await change('12');
  expect(props.onDayChange).not.toHaveBeenCalled();
  await act(async () => Simulate.keyDown(input(), {key:'Enter'}));
  expect(props.onDayChange).toHaveBeenCalledTimes(1);
  expect(props.onDayChange).toHaveBeenCalledWith(12);
});

test.each(['','0','-1','8','1.5'])('некоректний або майбутній день %s не застосовується', async value => {
  await change(value);
  expect(button('Готово').disabled).toBe(true);
  await act(async () => Simulate.keyDown(input(), {key:'Enter'}));
  expect(props.onDayChange).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
});

test('повторне відкриття показує вибраний день, а не незавершене введення', async () => {
  await change('');
  await render({isOpen:false});
  await render({isOpen:true,programDay:6});
  expect(input().value).toBe('6');
  expect(props.onDayChange).not.toHaveBeenCalled();
});

test('кнопка Поточний готує поточний день до підтвердження', async () => {
  await render({programDay:6});
  await change('');
  await act(async () => Simulate.click(button('Поточний')));
  expect(input().value).toBe('7');
  expect(props.onDayChange).not.toHaveBeenCalled();
  await act(async () => Simulate.click(button('Готово')));
  expect(props.onDayChange).toHaveBeenCalledWith(7);
});
