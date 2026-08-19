// Small transfer-related helpers shared by TransferManager
import type JSZip from 'jszip';

export const isBinaryFile = (path: string) => {
  return /\.(png|jpe?g|gif|webp|bmp|ico|tiff?|avif|heic|pdf|otf|ttf|woff2?|eot|zip|7z|rar|tar|gz|bz2|xz|mp3|wav|ogg|flac|aac|m4a|mp4|mov|avi|mkv|webm|wasm|exe|dll|so|dylib|bin)$/i.test(path);
};

export const zipCompressionOptions: Parameters<JSZip["generateAsync"]>[0] = { type: 'blob' as const, compression: 'DEFLATE' as const, compressionOptions: { level: 6 } };

export const isImageAsset = (path: string) => /\.(png|jpe?g|gif|webp|bmp|ico|tiff?|avif|heic)$/i.test(path);

export async function addTextFileToZip(zip: JSZip, getFileContent: (path: string) => Promise<string | null>, path: string) {
  const content = await getFileContent(path);
  if (content) {
    zip.file(path, content);
    return;
  }

  const fallbackAllowed = path === 'main.tex' || path === 'notebook.sty' || path.startsWith('latex/');
  if (!fallbackAllowed) return;

  try {
    const res = await fetch(`/latex/${encodeURIComponent(path)}`);
    if (res.ok) {
      const text = await res.text();
      zip.file(path, text);
    } else {
      console.error(`[Transfer] Failed to fetch fallback file "${path}" from /latex: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`[Transfer] Error fetching fallback file "${path}":`, err);
  }
}

export async function addAssetFileToZip(zip: JSZip, getAssetBase64: (path: string) => Promise<string | null>, path: string) {
  const base64 = await getAssetBase64(path);
  if (base64) zip.file(path, base64, { base64: true });
}

export {};
