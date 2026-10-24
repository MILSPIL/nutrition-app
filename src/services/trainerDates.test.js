import {kyivDateKey,initialTrainerDate,dateLabel} from './trainerDates';
test('display date follows Kyiv across midnight and DST',()=>{expect(kyivDateKey(new Date('2026-03-29T21:30:00Z'))).toBe('2026-03-30');});
test('historical prop never makes an implicit pinned day',()=>{expect(initialTrainerDate()).toEqual({mode:'default'});expect(initialTrainerDate({targetDate:'2026-01-02'})).toEqual({mode:'default'});expect(initialTrainerDate({mode:'pinned',targetDate:'2026-01-02'})).toEqual({mode:'pinned',targetDate:'2026-01-02'});expect(dateLabel('2026-01-02')).toBe('02.01.2026');});
