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
