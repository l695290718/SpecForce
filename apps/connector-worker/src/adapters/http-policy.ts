import { lookup } from "node:dns/promises";

export interface HttpPolicyOptions {
  allowedHosts: readonly string[];
  allowHttpLocalhost?: boolean;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  lookupHost?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

export interface HttpTextResponse {
  url: string;
  status: number;
  etag: string | null;
  contentType: string;
  text: string;
}

export class HttpPolicy {
  private readonly options: Required<Pick<HttpPolicyOptions, "maxRedirects" | "maxBytes" | "timeoutMs">> & HttpPolicyOptions;

  constructor(options: HttpPolicyOptions) {
    if (!options.allowedHosts.length) throw new Error("HTTP_ALLOWED_HOSTS_REQUIRED");
    this.options = { maxRedirects: 3, maxBytes: 2_000_000, timeoutMs: 10_000, ...options };
  }

  async getText(url: string, signal?: AbortSignal): Promise<HttpTextResponse> {
    let current = url;
    for (let redirect = 0; redirect <= this.options.maxRedirects; redirect += 1) {
      await this.assertUrl(current);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const response = await (this.options.fetchImpl ?? fetch)(current, { method: "GET", redirect: "manual", signal: controller.signal, headers: { accept: "application/json, application/yaml, text/yaml, text/plain" } });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location || redirect === this.options.maxRedirects) throw new Error("HTTP_REDIRECT_LIMIT_EXCEEDED");
          current = new URL(location, current).toString();
          continue;
        }
        if (!response.ok) throw new Error(`HTTP_STATUS_${response.status}`);
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType && !/(json|yaml|text\/plain)/iu.test(contentType)) throw new Error("HTTP_CONTENT_TYPE_UNSUPPORTED");
        const text = await readBoundedText(response, this.options.maxBytes);
        return { url: current, status: response.status, etag: response.headers.get("etag"), contentType, text };
      } catch (error) {
        if (controller.signal.aborted) throw new Error(signal?.aborted ? "HTTP_REQUEST_ABORTED" : "HTTP_TIMEOUT");
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    }
    throw new Error("HTTP_REDIRECT_LIMIT_EXCEEDED");
  }

  private async assertUrl(raw: string): Promise<void> {
    const parsed = new URL(raw);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
    if (parsed.protocol !== "https:" && !(this.options.allowHttpLocalhost && local && parsed.protocol === "http:")) throw new Error("HTTP_HTTPS_REQUIRED");
    if (!this.options.allowedHosts.includes(parsed.hostname)) throw new Error("HTTP_HOST_NOT_ALLOWED");
    const addresses = await (this.options.lookupHost ?? (async (hostname) => lookup(hostname, { all: true })))(parsed.hostname);
    if (addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("HTTP_PRIVATE_ADDRESS_REJECTED");
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) throw new Error("HTTP_RESPONSE_TOO_LARGE");
    chunks.push(next.value);
  }
  return new TextDecoder().decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function isPrivateAddress(address: string): boolean {
  return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe80)/iu.test(address);
}
