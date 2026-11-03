/** Split a spoken/typed instruction like “open Kalman filter then set noise to 3 and read the output” into commands for the app's command parser. */
export function parseCommandless(goal: string): string[] {
  const parts = goal.replace(/[.]+$/, '').split(/\s*(?:,|;|→|\bthen\b|\band then\b|\band\b(?=\s+(?:set|open|play|pause|reset|increase|decrease|change|go|select|start|stop)\b))\s*/i).map(s => s.trim()).filter(Boolean);
  return parts.filter(p => /^(?:please\s+)?(?:open|launch|load|start|run|set|change|increase|decrease|play|pause|stop|reset|go|select|switch|turn)\b/i.test(p)).map(p => p.replace(/^please\s+/i, ''));
}
