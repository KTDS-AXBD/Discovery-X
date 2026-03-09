export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
  toJSON() {
    return { code: this.code, name: this.name, message: this.message };
  }
}

export class NotFoundError extends ServiceError {
  constructor(
    public entity: string,
    public entityId: string,
  ) {
    super("NOT_FOUND", `${entity} not found: ${entityId}`);
  }
}

export class ValidationError extends ServiceError {
  constructor(
    public field: string,
    detail: string,
  ) {
    super("VALIDATION", `Validation failed on ${field}: ${detail}`);
  }
}

export class UnauthorizedError extends ServiceError {
  constructor(public action: string) {
    super("UNAUTHORIZED", `Unauthorized: ${action}`);
  }
}

export class ConflictError extends ServiceError {
  constructor(public resource: string) {
    super("CONFLICT", `Conflict on resource: ${resource}`);
  }
}
