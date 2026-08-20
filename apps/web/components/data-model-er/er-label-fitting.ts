export function fitErLabel(value: string, maxCharacters: number): string {
  const characters = Array.from(value);
  const limit = Math.max(1, Math.floor(maxCharacters));
  if (characters.length <= limit) return value;
  if (limit <= 3) return characters.slice(0, limit).join("");
  return `${characters.slice(0, limit - 3).join("")}...`;
}

export function getErHeaderLabelWidths(cardWidth: number): { title: number; subtitle: number } {
  const availableWidth = Math.max(48, cardWidth - 24);
  return {
    title: Math.max(8, Math.floor(availableWidth / 7)),
    subtitle: Math.max(8, Math.floor(availableWidth / 6)
  )};
}
