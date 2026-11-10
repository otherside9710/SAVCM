export function colombiaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function colombiaTime(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now);
}

export function minutesUntilColombiaDateTime(date: string, time: string, now = new Date()): number {
  const dateParts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeParts = time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!dateParts || !timeParts) return Number.NEGATIVE_INFINITY;
  const [, yearValue, monthValue, dayValue] = dateParts;
  const [, hourValue, minuteValue, secondValue = '0'] = timeParts;
  const [year, month, day, hours, minutes, seconds] = [yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue].map(Number);
  if (![year, month, day, hours, minutes, seconds].every(Number.isFinite)) return Number.NEGATIVE_INFINITY;
  const normalizedDate = new Date(Date.UTC(year, month - 1, day));
  if (normalizedDate.toISOString().slice(0, 10) !== date || hours > 23 || minutes > 59 || seconds > 59) return Number.NEGATIVE_INFINITY;

  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const current = Object.fromEntries(nowParts.map((part) => [part.type, part.value]));
  const currentWallClock = Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day), Number(current.hour), Number(current.minute), Number(current.second)) + now.getMilliseconds();
  const appointmentWallClock = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  return (appointmentWallClock - currentWallClock) / 60_000;
}
