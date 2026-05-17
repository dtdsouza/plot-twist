// Runs once per Jest worker, before any test module is loaded.
// Suffixes DB_NAME with the worker id so each worker owns an isolated database.
// Required because integration specs share `truncateIdentity()` — a single shared
// DB would race across parallel workers.

const workerId = process.env.JEST_WORKER_ID ?? '1'
const base = process.env.DB_NAME ?? 'plot-twist'
const suffix = `_test_w${workerId}`

if (!base.endsWith(suffix)) {
  process.env.DB_NAME = `${base}${suffix}`
}
