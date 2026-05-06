interface FileSystemHandle {
    readonly kind: 'file' | 'directory';
    readonly name: string;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    values(): AsyncIterableIterator<FileSystemHandle>;
}

interface Window {
    showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}