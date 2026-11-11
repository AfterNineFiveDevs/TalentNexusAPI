import { describe, expect, it } from 'vitest';
import { analyticsWindow } from './admin-analytics.service';
describe('Yangon reporting calendar', () => {
  it('switches days at 17:30 UTC, not UTC midnight', () => {
    const before = analyticsWindow(7, new Date('2026-11-01T17:29:59.999Z'));
    expect(before).toMatchObject({
      firstDate: '2026-10-26',
      lastDate: '2026-11-01',
      from: '2026-10-25T17:30:00.000Z',
    });
    const after = analyticsWindow(7, new Date('2026-11-01T17:30:00.000Z'));
    expect(after).toMatchObject({
      firstDate: '2026-10-27',
      lastDate: '2026-11-02',
      from: '2026-10-26T17:30:00.000Z',
    });
  });
  it('handles leap-day and year boundaries with exactly the chosen number of days', () => {
    const leap = analyticsWindow(7, new Date('2028-03-01T01:00:00.000Z'));
    expect(leap.firstDate).toBe('2028-02-24');
    expect(leap.lastDate).toBe('2028-03-01');
    const year = analyticsWindow(30, new Date('2027-01-01T01:00:00.000Z'));
    expect(year.firstDate).toBe('2026-12-03');
  });
});
