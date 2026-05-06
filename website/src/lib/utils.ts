/**
 * Utility functions for the Engineering Notebook.
 */

/**
 * Generates a UUID v7 (time-ordered).
 */
export function generateUUID(): string {
  const timestamp = Date.now();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // 48-bit timestamp (big-endian)
  bytes[0] = (timestamp / 0x10000000000) & 0xff;
  bytes[1] = (timestamp / 0x100000000) & 0xff;
  bytes[2] = (timestamp / 0x1000000) & 0xff;
  bytes[3] = (timestamp / 0x10000) & 0xff;
  bytes[4] = (timestamp / 0x100) & 0xff;
  bytes[5] = timestamp & 0xff;

  // Version 7 (0111) in the high 4 bits of bytes[6]
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variant 1 (10) in the high 2 bits of bytes[8]
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return Array.from(bytes)
    .map((b, i) => {
      const s = b.toString(16).padStart(2, "0");
      return (i === 4 || i === 6 || i === 8 || i === 10) ? "-" + s : s;
    })
    .join("");
}

/**
 * Generates a SHA-256 hash of the given content.
 * Useful for deduplicating assets.
 */
export async function hashContent(content: string | ArrayBuffer): Promise<string> {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extracts the file extension from a base64 data URL.
 */
export function getExtensionFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/);
  return match ? match[1] : "png";
}
/**
 * Simple debounce utility.
 */
export function debounce<Args extends unknown[], R>(
  func: (...args: Args) => R,
  wait: number
): (...args: Args) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
