import * as v from 'valibot';

export const LIST_KIND = 'LIST';

export const jobMetaSchema = v.object({
  search_condition_id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const mercariRecordSchema = v.object({
  title: v.string(),
  price: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export function buildScreenshotKey(
  searchConditionId: number,
  jobId: string,
): string {
  return `screenshots/${searchConditionId}/${jobId}.png`;
}

export function scopeJobUrl(
  url: string | URL,
  searchConditionId: number,
): string {
  const scopedUrl = new URL(url);
  scopedUrl.hash = `search-condition-${searchConditionId}`;
  return scopedUrl.toString();
}
