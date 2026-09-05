// A date-only provider observation is encoded at UTC midnight. Displaying it
// in the browser timezone would shift the session date back in the Americas.
export function formatReferenceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
}
