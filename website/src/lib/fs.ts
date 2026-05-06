export const getLocalFileContent = async (rootHandle: FileSystemDirectoryHandle, path: string): Promise<{ text?: string; base64?: string; isImage: boolean }> => {
  try {
    const parts = path.split('/');
    let currentHandle: FileSystemDirectoryHandle = rootHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    if (file.type.startsWith('image/')) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ base64: reader.result as string, isImage: true });
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
  const parts = path.split('/');
  let currentHandle: FileSystemDirectoryHandle = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  
  if (isBase64 && typeof content === 'string') {
    const base64Data = content.split(',')[1] || content;
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    await writable.write(byteArray);
  } else {
    await writable.write(content as FileSystemWriteChunkType);
  }
  
  await writable.close();
};

export const deleteLocalFileAtPath = async (rootHandle: FileSystemDirectoryHandle, path: string) => {
  const parts = path.split('/');
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
  } catch (e) {
    console.error(`Failed to list files in ${dirPath}`, e);
    return [];
  }
};

export const readLocalFile = async (rootHandle: FileSystemDirectoryHandle, path: string): Promise<string> => {
  const res = await getLocalFileContent(rootHandle, path);
  return res.text || "";
};
