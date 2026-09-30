/**
 * Agents that run once a day are not stale after the short fleet window.
 * A jobless agent still uses the floor, because the supervisor should touch it on every pass.
 */
export function agentTelemetryLimitMinutes(cadenceMinutes: number[], floorMinutes: number) {
  const finite = cadenceMinutes.filter((value) => Number.isFinite(value) && value > 0);
  if (!finite.length) return floorMinutes;
  return Math.max(floorMinutes, Math.min(...finite));
}
