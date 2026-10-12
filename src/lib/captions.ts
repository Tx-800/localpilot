/**
 * Caption helpers shared by the server (generation, publishing, validation)
 * and the draft card (live character counts). No server-only imports.
 */

export const INSTAGRAM_MAX = 2200;
export const GBP_MAX = 1500;
export const MAX_HASHTAGS = 30; // Instagram's limit per post

/** "#a, b  #c" / ["a", "#b"] → ["#a", "#b", "#c"] (deduped, max 30). */
export function normalizeHashtags(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[\s,]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const tag = raw.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${tag}`);
    if (out.length >= MAX_HASHTAGS) break;
  }
  return out;
}

/** What Instagram receives: caption body, blank line, hashtags. */
export function composeInstagramCaption(caption: string, hashtags: string[]): string {
  const body = caption.trim();
  return hashtags.length ? `${body}\n\n${hashtags.join(' ')}` : body;
}

/** Split trailing hashtag-only lines off a caption (models sometimes put them inline). */
export function splitTrailingHashtags(text: string): { body: string; hashtags: string[] } {
  const lines = text.trim().split('\n');
  const tags: string[] = [];
  while (lines.length && /^\s*(#[\p{L}\p{N}_]+[\s,]*)+$/u.test(lines[lines.length - 1])) {
    tags.unshift(...(lines.pop() as string).split(/[\s,]+/));
  }
  return { body: lines.join('\n').trim(), hashtags: normalizeHashtags(tags) };
}

/** What Google Business receives: its own text, or the caption body without hashtags. */
export function composeGoogleText(gbpCaption: string, caption: string): string {
  // Fallback: drop the trailing hashtag block; inline #words keep the word, lose the '#'.
  const text = gbpCaption.trim() || splitTrailingHashtags(caption).body.replace(/#(?=[\p{L}\p{N}_])/gu, '').trim();
  return text.length > GBP_MAX ? `${text.slice(0, GBP_MAX - 1)}…` : text;
}
