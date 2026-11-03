import { buildDaySlots, isRealDate, removeBusy, todayIn, zonedTimeToUtc } from '../src/services/availability.service';

const NY = 'America/New_York';
const hours = { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };

describe('Time zone helpers', () => {
  it('9:00 in New York is 13:00 UTC in summer and 14:00 UTC in winter', () => {
    expect(zonedTimeToUtc('2026-08-11', '09:00', NY).toISOString()).toBe('2026-08-11T13:00:00.000Z');
    expect(zonedTimeToUtc('2026-12-01', '09:00', NY).toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });

  it('handles the days the clocks change', () => {
    // US summer time started on 2026-03-08 and ended on 2026-11-01.
    expect(zonedTimeToUtc('2026-03-08', '09:00', NY).toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(zonedTimeToUtc('2026-11-01', '09:00', NY).toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('works for a zone ahead of UTC', () => {
    expect(zonedTimeToUtc('2026-08-11', '09:00', 'Asia/Karachi').toISOString()).toBe('2026-08-11T04:00:00.000Z');
  });

  it('knows real dates and today in a zone', () => {
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('11/02/2026')).toBe(false);
    expect(todayIn(NY, new Date('2026-08-11T02:00:00Z'))).toBe('2026-08-10'); // still the evening before in New York
  });
});

describe('Day slots', () => {
  it('a weekday has 16 half-hour slots from 9:00 to 16:30', () => {
    const slots = buildDaySlots('2026-08-11', NY, hours); // a Tuesday
    expect(slots).toHaveLength(16);
    expect(slots[0].toISOString()).toBe('2026-08-11T13:00:00.000Z');
    expect(slots[15].toISOString()).toBe('2026-08-11T20:30:00.000Z');
  });

  it('a weekend has none (closed)', () => {
    expect(buildDaySlots('2026-08-15', NY, hours)).toEqual([]); // Saturday
    expect(buildDaySlots('2026-08-16', NY, hours)).toEqual([]); // Sunday
  });

  it('follows the configured hours and days', () => {
    expect(buildDaySlots('2026-08-15', NY, { start: '10:00', end: '12:00', days: [6] })).toHaveLength(4);
    expect(buildDaySlots('2026-08-11', NY, { start: '12:00', end: '12:00', days: [2] })).toEqual([]);
  });
});

describe('Removing busy time', () => {
  const slots = buildDaySlots('2026-08-11', NY, hours);
  const at = (iso: string) => new Date(iso);

  it('removes a slot that overlaps a busy interval, but not one that only touches it', () => {
    const busy = [{ start: at('2026-08-11T14:00:00Z'), end: at('2026-08-11T14:30:00Z') }]; // 10:00-10:30 NY
    const free = removeBusy(slots, busy).map((s) => s.toISOString());
    expect(free).not.toContain('2026-08-11T14:00:00.000Z');
    expect(free).toContain('2026-08-11T13:30:00.000Z'); // ends exactly when the busy time starts
    expect(free).toContain('2026-08-11T14:30:00.000Z'); // starts exactly when it ends
    expect(free).toHaveLength(15);
  });

  it('a long event removes every slot it covers; a part-slot overlap removes the slot', () => {
    const busy = [{ start: at('2026-08-11T14:15:00Z'), end: at('2026-08-11T15:45:00Z') }];
    const free = removeBusy(slots, busy).map((s) => s.toISOString());
    for (const gone of ['14:00', '14:30', '15:00', '15:30']) expect(free).not.toContain(`2026-08-11T${gone}:00.000Z`);
    expect(free).toContain('2026-08-11T16:00:00.000Z');
  });
});
