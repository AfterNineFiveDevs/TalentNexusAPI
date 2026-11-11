import { Injectable } from '@nestjs/common';
import { db } from '../prisma/db';

@Injectable()
export class AdminAnalyticsRepository {
  async overview(
    from: string,
    to: string,
    firstDate: string,
    lastDate: string,
  ) {
    // One statement gives all totals and daily bins the same database snapshot.
    // Date expressions need SQL; all values are bound parameters, never SQL text.
    const plan = db.raw.sql`
      WITH registrations AS (
        SELECT to_char("createdAt" AT TIME ZONE 'Asia/Yangon', 'YYYY-MM-DD') AS day, count(*) AS n
        FROM public."user" WHERE role = 'TALENT' AND "createdAt" >= ${from}::timestamptz AND "createdAt" < ${to}::timestamptz GROUP BY 1
      ), publications AS (
        SELECT to_char("publishedAt" AT TIME ZONE 'Asia/Yangon', 'YYYY-MM-DD') AS day, count(*) AS n
        FROM public.job WHERE "publishedAt" >= ${from}::timestamptz AND "publishedAt" < ${to}::timestamptz GROUP BY 1
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
        coalesce(r.n, 0)::text AS registrations,
        coalesce(p.n, 0)::text AS publications,
        (SELECT count(*)::text FROM public."user" WHERE role = 'TALENT') AS total
      FROM generate_series(${firstDate}::timestamp, ${lastDate}::timestamp, interval '1 day') AS days(day)
      LEFT JOIN registrations r ON r.day = to_char(days.day, 'YYYY-MM-DD')
      LEFT JOIN publications p ON p.day = to_char(days.day, 'YYYY-MM-DD')
      ORDER BY days.day
    `
      .returnsRow({
        date: 'pg/text@1',
        registrations: 'pg/text@1',
        publications: 'pg/text@1',
        total: 'pg/text@1',
      })
      .build();
    return db.transaction((tx) => tx.query(plan));
  }
}
