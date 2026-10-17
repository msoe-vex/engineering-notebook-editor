/** Max authenticated binary body through Core (assets + compiled PDF exports). */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
export function formatByteSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
/** Throws if `byteLength` exceeds {@link MAX_UPLOAD_BYTES}. */
export function assertUploadSize(byteLength, label = "File") {
    if (byteLength > MAX_UPLOAD_BYTES) {
        throw new Error(`${label} is ${formatByteSize(byteLength)}; maximum upload size is ${formatByteSize(MAX_UPLOAD_BYTES)}.`);
    }
}
