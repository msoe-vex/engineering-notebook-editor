/** Max authenticated binary body through Core (assets + compiled PDF exports). */
export declare const MAX_UPLOAD_BYTES: number;
export declare function formatByteSize(bytes: number): string;
/** Throws if `byteLength` exceeds {@link MAX_UPLOAD_BYTES}. */
export declare function assertUploadSize(byteLength: number, label?: string): void;
