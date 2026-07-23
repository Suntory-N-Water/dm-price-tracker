import type { Meta, JsonValue } from '../types';

export function stringifyMeta(meta: Meta | undefined): string {
  return JSON.stringify(meta ?? {});
}

export function stringifyData(data: JsonValue): string {
  return typeof data === 'string' ? data : JSON.stringify(data);
}

export function parseMeta(meta: string): Meta {
  const parsed: unknown = JSON.parse(meta);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Meta;
}
