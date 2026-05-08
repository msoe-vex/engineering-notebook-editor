import { getMimeTypeFromExtension } from './utils';

export const getLocalFileContent = async (rootHandle: FileSystemDirectoryHandle, path: string): Promise<{ text?: string; base64?: string; isImage: boolean }> => {
  if (path.startsWith('data:')) {
    return { base64: path, isImage: true };
  }
  try {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) throw new Error("Invalid path");
    
    let currentHandle: FileSystemDirectoryHandle = rootHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    const isImage = file.type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(parts[parts.length - 1]);

    if (isImage) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          let res = reader.result as string;
          // If browser doesn't know mime type, it might return 'data:;base64,...'
          if (res.startsWith('data:;base64,')) {
            res = res.replace('data:;base64,', `data:${getMimeTypeFromExtension(path)};base64,`);
          }
          resolve({ base64: res, isImage: true });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    const text = await file.text();
    return { text, isImage: false };
  } catch (e: unknown) {
    if (e instanceof Error && e.name !== 'NotFoundError') {
      console.error(`Local read failed for ${path}`, e);
    }
    throw e;
  }
};

export const writeLocalFile = async (rootHandle: FileSystemDirectoryHandle, path: string, content: string | Uint8Array, isBase64 = false) => {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) throw new Error("Invalid path");

  let currentHandle: FileSystemDirectoryHandle = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  
  if (isBase64 && typeof content === 'string') {
    // 1. Remove data URL prefix if present
    let base64Data = content.includes(',') ? content.split(',')[1] : content;
    // 2. Remove all whitespace
    base64Data = base64Data.replace(/\s/g, '');
    // 3. Handle URL-safe Base64 (replace - with +, _ with /)
    base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');
    // 4. Fix padding if missing
    while (base64Data.length % 4 !== 0) {
      base64Data += '=';
    }
    
    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      await writable.write(bytes);
    } catch (atobError) {
      console.error("Base64 decoding failed", atobError);
      throw atobError;
    }
  } else {
    await writable.write(content as FileSystemWriteChunkType);
  }
  
  await writable.close();
};

export const deleteLocalFileAtPath = async (rootHandle: FileSystemDirectoryHandle, path: string) => {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return;

  let currentHandle: FileSystemDirectoryHandle = rootHandle;
  try {
    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }
    await currentHandle.removeEntry(parts[parts.length - 1]);
  } catch (e) {
    // If it's already gone, that's fine
    if (e instanceof Error && e.name !== 'NotFoundError') throw e;
  }
};

let localWriteQueue = Promise.resolve();
export const queueLocalOp = async (op: () => Promise<void>) => {
  const next = localWriteQueue.then(op).catch(e => {
    console.error("Local FS operation failed in queue", e);
  });
  localWriteQueue = next;
  return next;
};

export const listLocalFiles = async (rootHandle: FileSystemDirectoryHandle, dirPath: string): Promise<{ name: string; path: string }[]> => {
  try {
    const parts = dirPath.split('/').filter(Boolean);
    let currentHandle: FileSystemDirectoryHandle = rootHandle;
    for (const part of parts) {
      currentHandle = await currentHandle.getDirectoryHandle(part);
    }
    const files: { name: string; path: string }[] = [];
    for await (const entry of currentHandle.values()) {
      if (entry.kind === 'file') {
        files.push({ name: entry.name, path: `${dirPath}/${entry.name}` });
      }
    }
    return files;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'NotFoundError') {
      return [];
    }
    console.error(`Failed to list files in ${dirPath}`, e);
    return [];
  }
};

export const ensureLocalDirectory = async (rootHandle: FileSystemDirectoryHandle, dirPath: string) => {
  const parts = dirPath.split('/').filter(Boolean);
  let currentHandle: FileSystemDirectoryHandle = rootHandle;
  for (const part of parts) {
    currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
  }
};

export const readLocalFile = async (rootHandle: FileSystemDirectoryHandle, path: string): Promise<string> => {
  const res = await getLocalFileContent(rootHandle, path);
  return res.text || "";
};
