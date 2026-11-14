export function durationText(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0m";
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  return `${remainingSeconds}s`;
}

export function countText(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function setPageTitle(title?: string): void {
  document.title = title ? `${title} · Videos` : "Videos";
}

export function timestampText(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = String(total % 60).padStart(2, "0");
  if (hours === 0) return `${minutes}:${remaining}`;
  return `${hours}:${String(minutes).padStart(2, "0")}:${remaining}`;
}
