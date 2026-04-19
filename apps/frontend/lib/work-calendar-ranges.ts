/**
 * Range date condivisi tra `/work-calendar`, precache navigazione e prefetch post-login.
 * Evita drift tra `AppPrecache` e la vista mensile effettiva.
 */

export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(last)}`
  };
}

/** Mese precedente → ultimo giorno mese successivo (vista personale ampia). */
export function calendarWideRange(): { from: string; to: string } {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/** Intervallo mese civile corrente (stesso contratto di `monthRange` per oggi). */
export function currentCalendarMonthRange(): { from: string; to: string; year: number; month: number } {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return { year, month, ...monthRange(year, month) };
}

/** Unisce intervallo wide, YTD e fine mese corrente per `fetchUserCalendar`. */
export function mergedPersonalCalendarRange(): { from: string; to: string } {
  const wide = calendarWideRange();
  const { to: monthTo } = currentCalendarMonthRange();
  const y = new Date().getFullYear();
  const yearStart = `${y}-01-01`;
  const from = wide.from < yearStart ? wide.from : yearStart;
  const to = wide.to > monthTo ? wide.to : monthTo;
  return { from, to };
}
