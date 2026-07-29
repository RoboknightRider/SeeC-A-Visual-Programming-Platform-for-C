import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Removes ANSI escape codes from a string.
 * Useful for cleaning up compiler output.
 */
export const stripAnsi = (str: string): string => {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
};

/**
 * Formats a date to a locale time string for logging.
 */
export const getTimestamp = (): string => {
  return new Date().toLocaleTimeString();
};
