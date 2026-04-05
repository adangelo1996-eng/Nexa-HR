-- Timbrature mock: tutti i dipendenti, giorni lavorativi febbraio–marzo 2026 (entrata/uscita come canale web).
-- Idempotente: ON CONFLICT DO NOTHING su id timbrature e su (userId, date) riepiloghi.

INSERT INTO time_entries (id, "userId", type, at, source)
SELECT
  'te-mock-' || replace(replace(u.id, '/', '-'), ' ', '') || '-' || to_char(cd.d, 'YYYYMMDD') || '-in',
  u.id,
  'clock_in',
  to_char(cd.d, 'YYYY-MM-DD') || 'T06:00:00.000Z',
  'web'
FROM users u
CROSS JOIN (
  SELECT gs::date AS d
  FROM generate_series(date '2026-02-01', date '2026-03-31', interval '1 day') AS gs
) cd
WHERE extract(isodow from cd.d) <= 5
ON CONFLICT (id) DO NOTHING;

INSERT INTO time_entries (id, "userId", type, at, source)
SELECT
  'te-mock-' || replace(replace(u.id, '/', '-'), ' ', '') || '-' || to_char(cd.d, 'YYYYMMDD') || '-out',
  u.id,
  'clock_out',
  to_char(cd.d, 'YYYY-MM-DD') || 'T14:00:00.000Z',
  'web'
FROM users u
CROSS JOIN (
  SELECT gs::date AS d
  FROM generate_series(date '2026-02-01', date '2026-03-31', interval '1 day') AS gs
) cd
WHERE extract(isodow from cd.d) <= 5
ON CONFLICT (id) DO NOTHING;

INSERT INTO workday_summaries ("userId", date, "minutesWorked", mode, "workedSeconds", "overtimeSeconds")
SELECT
  u.id,
  to_char(cd.d, 'YYYY-MM-DD'),
  480,
  'office',
  28800,
  0
FROM users u
CROSS JOIN (
  SELECT gs::date AS d
  FROM generate_series(date '2026-02-01', date '2026-03-31', interval '1 day') AS gs
) cd
WHERE extract(isodow from cd.d) <= 5
ON CONFLICT ("userId", date) DO NOTHING;
