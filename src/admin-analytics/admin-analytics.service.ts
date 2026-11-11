import { Injectable } from '@nestjs/common';
import type {
  AdminAnalyticsOverview,
  AdminAnalyticsQuery,
} from '@talent-nexus/contracts';
import { AdminAnalyticsRepository } from './admin-analytics.repository';

// Asia/Yangon uses UTC+06:30 for the supported contemporary reporting periods.
const offsetMs = 390 * 60_000;
const dayMs = 86_400_000;
export function analyticsWindow(
  period: AdminAnalyticsQuery['period'],
  instant = new Date(),
) {
  const to = instant.toISOString();
  const local = new Date(instant.getTime() + offsetMs)
    .toISOString()
    .slice(0, 10);
  const startToday = Date.parse(`${local}T00:00:00.000Z`) - offsetMs;
  const fromTime = startToday - (period - 1) * dayMs;
  return {
    from: new Date(fromTime).toISOString(),
    to,
    firstDate: new Date(fromTime + offsetMs).toISOString().slice(0, 10),
    lastDate: local,
  };
}
const count = (raw: string) => {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('Analytics count exceeds the supported integer range');
  return value;
};
@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly repository: AdminAnalyticsRepository) {}
  async overview(query: AdminAnalyticsQuery): Promise<AdminAnalyticsOverview> {
    const window = analyticsWindow(query.period);
    const rows = await this.repository.overview(
      window.from,
      window.to,
      window.firstDate,
      window.lastDate,
    );
    const daily = rows.map((row) => ({
      date: row.date,
      newCandidates: count(row.registrations),
      jobsFirstPublished: count(row.publications),
    }));
    const unavailable = {
      value: null,
      available: false as const,
      reason: 'Activity tracking is not implemented' as const,
    };
    return {
      period: query.period,
      timezone: 'Asia/Yangon',
      from: window.from,
      to: window.to,
      generatedAt: window.to,
      totalCandidates: count(rows[0]?.total ?? '0'),
      newCandidates: daily.reduce((sum, d) => sum + d.newCandidates, 0),
      jobsFirstPublished: daily.reduce(
        (sum, d) => sum + d.jobsFirstPublished,
        0,
      ),
      daily,
      activeUsers: unavailable,
      jobViews: unavailable,
      applyClicks: unavailable,
      journeyRates: unavailable,
    };
  }
}
