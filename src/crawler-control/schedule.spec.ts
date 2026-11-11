import { describe, it, expect } from 'vitest';
import { nextOccurrence } from './schedule';
import {
  crawlerScheduleSchema,
  updateCrawlerSourceSchema,
} from '@talent-nexus/contracts';

describe('Crawler schedule calendar', () => {
  it('uses Yangon weekdays and excludes the current occurrence', () => {
    const schedule = {
      kind: 'weekly' as const,
      weekdays: [1, 4],
      time: '09:00',
    };
    expect(
      nextOccurrence(
        schedule,
        'Asia/Yangon',
        new Date('2026-11-01T00:00:00Z'),
      ).toISOString(),
    ).toBe('2026-11-02T02:30:00.000Z');
    expect(
      nextOccurrence(
        schedule,
        'Asia/Yangon',
        new Date('2026-11-02T02:30:00Z'),
      ).toISOString(),
    ).toBe('2026-11-05T02:30:00.000Z');
  });
  it('uses elapsed hours across DST for intervals', () => {
    expect(
      nextOccurrence(
        { kind: 'interval', hours: 24 },
        'America/New_York',
        new Date('2026-11-01T04:00:00Z'),
      ).toISOString(),
    ).toBe('2026-11-02T04:00:00.000Z');
  });
  it('does not repeat the second occurrence of a DST wall-clock time', () => {
    expect(
      nextOccurrence(
        { kind: 'weekly', weekdays: [0], time: '01:30' },
        'America/New_York',
        new Date('2026-11-01T05:30:00Z'),
      ).toISOString(),
    ).toBe('2026-11-08T06:30:00.000Z');
  });
  it('skips nonexistent local time during spring-forward', () => {
    expect(
      nextOccurrence(
        { kind: 'weekly', weekdays: [0], time: '02:30' },
        'America/New_York',
        new Date('2026-03-08T05:00:00Z'),
      ).toISOString(),
    ).toBe('2026-03-15T06:30:00.000Z');
  });
  it('rejects duplicate weekdays, invalid timezones, unknown fields and empty edits', () => {
    expect(
      crawlerScheduleSchema.safeParse({
        kind: 'weekly',
        weekdays: [1, 1],
        time: '09:00',
      }).success,
    ).toBe(false);
    for (const change of [
      {},
      { timezone: 'bad/zone' },
      { pageLimit: 101 },
      { sourceId: 'manual' },
    ])
      expect(
        updateCrawlerSourceSchema.safeParse({ expectedVersion: 0, ...change })
          .success,
      ).toBe(false);
  });
});
