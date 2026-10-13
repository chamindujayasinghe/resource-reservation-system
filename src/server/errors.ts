import { DatabaseError } from "pg";

export type DomainErrorCode =
  | "SLOT_TAKEN"
  | "RESOURCE_INACTIVE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ALREADY_CANCELLED"
  | "ALREADY_STARTED"
  | "VALIDATION";

// An expected failure with a message that is safe to show to the user.
// Throwing one inside a transaction rolls the transaction back.
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly field?: string;

  constructor(
    code: DomainErrorCode,
    message: string,
    options: { field?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "DomainError";
    this.code = code;
    this.field = options.field;
  }
}

const PG_EXCLUSION_VIOLATION = "23P01";
const PG_UNIQUE_VIOLATION = "23505";

const MAX_CAUSE_DEPTH = 5;

// The ORM may wrap the driver's error, so look down the cause chain for it.
export function findPgError(error: unknown): DatabaseError | undefined {
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current instanceof DatabaseError) {
      return current;
    }
    if (!(current instanceof Error)) {
      return undefined;
    }
    current = current.cause;
  }

  return undefined;
}

// Translates a database error into a DomainError, identified by SQLSTATE and
// constraint name. Returns undefined for anything unrecognised: those are bugs
// or outages, and the caller must rethrow them, not show them to the user.
export function mapDbError(error: unknown): DomainError | undefined {
  const pgError = findPgError(error);

  if (!pgError) {
    return undefined;
  }

  if (
    pgError.code === PG_EXCLUSION_VIOLATION &&
    pgError.constraint === "reservations_no_overlap"
  ) {
    return new DomainError(
      "SLOT_TAKEN",
      "That time slot was just taken by someone else. Please choose another time.",
      { cause: error },
    );
  }

  if (
    pgError.code === PG_UNIQUE_VIOLATION &&
    pgError.constraint === "resources_name_unique"
  ) {
    return new DomainError(
      "VALIDATION",
      "A resource with this name already exists.",
      { field: "name", cause: error },
    );
  }

  return undefined;
}
