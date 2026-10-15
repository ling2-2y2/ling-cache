/**
 * Typed errors of the cache hub.
 * @module dsh-cache/src/error
 */

/** Machine-readable failure codes of {@link CacheError}. */
export type CacheErrorCode =
  | 'duplicate-store'
  | 'store-not-found'
  | 'invalid-value'
  | 'store-closed'

/** Hub-level failure with a stable code; providers surface driver errors as-is. */
export class CacheError extends Error {
  override readonly name = 'CacheError'
  /** Stable machine-readable code for callers that branch on failures. */
  readonly code: CacheErrorCode

  /**
   * @param code - Failure category.
   * @param message - Human-readable detail, including names involved.
   * @param options - Standard error options; `cause` carries the driver error.
   */
  constructor(code: CacheErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
  }
}
