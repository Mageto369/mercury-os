export function partitionValidationSeed(
  existing: Array<{ id: string; symbol: string }>,
  requested: Array<{ symbol: string }>,
) {
  const bySymbol = new Map(existing.map((row) => [row.symbol, row]));
  const seed: string[] = [];
  const skipped: string[] = [];
  for (const item of requested) {
    const row = bySymbol.get(item.symbol);
    if (row && !row.id.startsWith('validation:')) skipped.push(item.symbol);
    else seed.push(item.symbol);
  }
  return { seed, skipped };
}
