const jstDateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// 価格履歴は同じ日時文字列を1レンダーで数百回整形するため、結果を使い回す
const formattedCache = new Map<string, string>();

export function formatJstDateTime(value: string): string {
  const cached = formattedCache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const isoValue = /(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    formattedCache.set(value, value);
    return value;
  }

  const parts = Object.fromEntries(
    jstDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const formatted = `${Number(parts.year)}年${Number(parts.month)}月${Number(parts.day)}日 ${parts.hour}:${parts.minute}`;
  formattedCache.set(value, formatted);
  return formatted;
}
