import type { CrawlerSchedule } from '@talent-nexus/contracts';

/** Sunday=0. Repeated DST times run once; nonexistent local times are skipped. */
export function nextOccurrence(
  schedule: CrawlerSchedule,
  timezone: string,
  after: Date,
): Date {
  if (schedule.kind === 'interval')
    return new Date(after.getTime() + schedule.hours * 3_600_000);
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const seenDates = new Set<string>();
  const start = Math.floor(after.getTime() / 60000) * 60000 - 86_400_000;
  for (
    let value = start;
    value <= after.getTime() + 9 * 86_400_000;
    value += 60000
  ) {
    const parts = Object.fromEntries(
      format.formatToParts(value).map((p) => [p.type, p.value]),
    );
    if (
      !schedule.weekdays.includes(days.indexOf(parts.weekday)) ||
      `${parts.hour}:${parts.minute}` !== schedule.time
    )
      continue;
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    if (seenDates.has(date)) continue;
    seenDates.add(date);
    if (value > after.getTime()) return new Date(value);
  }
  throw new Error('Could not calculate next weekly occurrence');
}
