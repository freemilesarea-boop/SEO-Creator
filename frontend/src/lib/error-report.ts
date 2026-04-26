/**
 * Build a single-string diagnostic report users can paste into a
 * support thread. Intentionally minimal — version / platform /
 * timestamp / current screen / error / optional last action and id.
 *
 * No filesystem access, no PII, no payload dumps.
 */

export interface ErrorReportInput {
  appVersion?: string;
  platform?: string;
  /** "input" | "results" | 임의 라벨 */
  screen?: string;
  errorMessage: string;
  lastAction?: string;
  generationId?: string;
  language?: string;
  /** ISO timestamp. 미지정 시 현재 시각. */
  timestamp?: string;
}

export function buildErrorReport(input: ErrorReportInput): string {
  const lines: string[] = [];
  lines.push("[SEO Creator] Error Report");
  lines.push("=========================");
  lines.push(`Timestamp     : ${input.timestamp || new Date().toISOString()}`);
  lines.push(`App version   : ${input.appVersion || "dev"}`);
  lines.push(`Platform      : ${input.platform || "unknown"}`);
  if (input.screen) lines.push(`Screen        : ${input.screen}`);
  if (input.lastAction) lines.push(`Last action   : ${input.lastAction}`);
  if (input.generationId) lines.push(`Generation ID : ${input.generationId}`);
  if (input.language) lines.push(`Language      : ${input.language}`);
  lines.push("");
  lines.push("Error:");
  lines.push(input.errorMessage || "(no message)");
  return lines.join("\n");
}
