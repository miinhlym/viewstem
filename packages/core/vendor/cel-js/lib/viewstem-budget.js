// Experimental Viewstem cost profile. Not a claim of wall-clock isolation.
export class CostLimitError extends Error {
  constructor() {
    super('CEL evaluation cost limit exceeded')
    this.name = 'CostLimitError'
    this.code = 'LIMIT_EXCEEDED'
  }
}

export class EvaluationBudget {
  #remaining
  #error
  constructor(limit) { this.#remaining = limit }
  charge(amount = 1) {
    if (this.#error) throw this.#error
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > this.#remaining) {
      this.#error = new CostLimitError()
      throw this.#error
    }
    this.#remaining -= amount
  }
}

export function sizeCost(value) {
  if (typeof value === 'string' || Array.isArray(value) || value instanceof Uint8Array) return value.length
  if (value instanceof Map || value instanceof Set) return value.size
  if (value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) return Object.keys(value).length
  return 1
}
