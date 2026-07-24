const jstDateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatJstDateTime(value: string): string {
  const isoValue = /(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = Object.fromEntries(
    jstDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${Number(parts.year)}年${Number(parts.month)}月${Number(parts.day)}日 ${parts.hour}:${parts.minute}`;
}
