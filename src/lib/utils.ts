import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Removes ANSI escape codes from a string.
 * Useful for cleaning up compiler output.
 */
/**
 * Formats a date to a locale time string for logging.
 */
export const getTimestamp = (): string => {
  return new Date().toLocaleTimeString();
};
