export interface TextureResource { key: string; texture: unknown; }

export class ErTextureCache<T = unknown> {
  private readonly entries = new Map<string, T>();
  constructor(private readonly capacity = 64) {}

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) { this.entries.delete(key); this.entries.set(key, value); }
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > Math.max(1, this.capacity)) this.entries.delete(this.entries.keys().next().value!);
  }

  delete(key: string): boolean { return this.entries.delete(key); }
  clear(dispose?: (value: T) => void): void { for (const value of this.entries.values()) dispose?.(value); this.entries.clear(); }
  get size(): number { return this.entries.size; }
  keys(): string[] { return [...this.entries.keys()]; }
}
