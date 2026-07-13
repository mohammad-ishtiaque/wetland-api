// Shared pagination parser. Guards against page=0, negative values, and
// non-numeric input (all of which produce a negative or NaN `skip` that
// MongoDB throws on), and caps `limit` so a careless or malicious request
// can't pull an entire collection in one page.
//
// Extracted here because this exact bug (unguarded `(page - 1) * limit`)
// was found independently in two different modules during a production
// audit — evaluation.controller.js's getAllEvaluations, and (already fixed)
// subscription.controller.js's listSubscriptions/listTransactions — so it's
// worth having one correct implementation instead of three chances to get
// it wrong.
export function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query?.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query?.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
