export type Strategy = "full" | "per-document" | "retrieval";

export async function runStrategies<T>(repetition: number, operations: {
  full: () => Promise<void>;
  discover: () => Promise<T>;
  perDocument: (discovery: T) => Promise<void>;
  retrieval: (discovery: T) => Promise<void>;
  onError: (strategy: Strategy) => Promise<void>;
}) {
  const attempt = async (strategy: Strategy, run: () => Promise<void>) => {
    try { await run(); }
    catch { await operations.onError(strategy); }
  };
  // Alternate placement without letting one strategy prevent another from running.
  if (repetition % 2 === 1) await attempt("full", operations.full);
  let discovery: T;
  try { discovery = await operations.discover(); }
  catch {
    await operations.onError("per-document");
    await operations.onError("retrieval");
    if (repetition % 2 === 0) await attempt("full", operations.full);
    return;
  }
  const order = repetition % 2 === 1 ? ["per-document", "retrieval"] as const : ["retrieval", "per-document"] as const;
  for (const strategy of order) {
    await attempt(strategy, () => strategy === "per-document" ? operations.perDocument(discovery) : operations.retrieval(discovery));
  }
  if (repetition % 2 === 0) await attempt("full", operations.full);
}
