export function fitErLabel(value: string, maxCharacters: number): string {
  const characters = Array.from(value);
  const limit = Math.max(1, Math.floor(maxCharacters));
  if (characters.length <= limit) return value;
  if (limit <= 3) return characters.slice(0, limit).join("");
  return `${characters.slice(0, limit - 3).join("")}...`;
}

/** Rough per-glyph advance in em units: CJK/fullwidth glyphs occupy ~1em, others ~0.58em. */
function glyphEmUnits(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x2e80 ? 1 : 0.58;
}

export function estimateTextWidthPx(value: string, fontSize: number): number {
  let units = 0;
  for (const char of Array.from(value)) units += glyphEmUnits(char);
  return units * fontSize;
}

export function fitErLabelToWidth(value: string, maxWidthPx: number, fontSize = 11): string {
  const limit = Math.max(8, maxWidthPx);
  if (estimateTextWidthPx(value, fontSize) <= limit) return value;
  const characters = Array.from(value);
  let fitted = "";
  for (const char of characters) {
    if (estimateTextWidthPx(`${fitted}${char}…`, fontSize) > limit) break;
    fitted += char;
  }
  return fitted ? `${fitted}…` : characters.slice(0, 1).join("");
}

export function getErHeaderLabelWidths(cardWidth: number): { title: number; subtitle: number } {
  const availableWidth = Math.max(48, cardWidth - 24);
  return {
    title: Math.max(8, Math.floor(availableWidth / 7)),
    subtitle: Math.max(8, Math.floor(availableWidth / 6)
  )};
}
