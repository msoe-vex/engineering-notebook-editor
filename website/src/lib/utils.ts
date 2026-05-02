/**
 * Utility functions for the Engineering Notebook.
 */

/**
 * Generates a standard UUID v4.
 * Uses crypto.randomUUID() if available, fallback to a math-based generator.
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments where crypto.randomUUID is not available
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
