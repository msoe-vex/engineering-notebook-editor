import { twMerge } from "tailwind-merge";

/** ClassName joiner with tailwind-merge for variant composition. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
