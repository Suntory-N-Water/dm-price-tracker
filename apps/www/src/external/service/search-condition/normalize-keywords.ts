const HALF_WIDTH_KATAKANA_PATTERN = /[\uFF61-\uFF9F]+/gu;
const WHITESPACE_PATTERN = /\s/u;

export function normalizeKeywords(keywords: readonly string[]): string[] {
  if (keywords.length > 3) {
    throw new Error('ワードは3枠以内で入力してください');
  }

  const normalizedKeywords = keywords
    .map((keyword) =>
      keyword
        .replace(/[\uFF01-\uFF5E]/gu, (character) =>
          String.fromCodePoint((character.codePointAt(0) ?? 0) - 0xfee0),
        )
        .replace(/\u3000/gu, ' ')
        .replace(HALF_WIDTH_KATAKANA_PATTERN, (characters) =>
          characters.normalize('NFKC'),
        )
        .trim(),
    )
    .filter((keyword) => keyword !== '');

  if (normalizedKeywords.some((keyword) => WHITESPACE_PATTERN.test(keyword))) {
    throw new Error('1枠には1単語だけ入力してください');
  }

  return [...new Set(normalizedKeywords)].sort();
}
