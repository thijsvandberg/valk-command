export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export class NotFoundError extends ServiceError {
  constructor(entity: string, identifier: string) {
    super("NOT_FOUND", `${entity} not found: ${identifier}`, 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super("VALIDATION", message, 400);
    this.name = "ValidationError";
  }
}

export class ConflictError extends ServiceError {
  constructor(
    message: string,
    public readonly details: { contentChanged: boolean },
  ) {
    super("CONFLICT", message, 409);
    this.name = "ConflictError";
  }
}

export class JiraUnavailableError extends ServiceError {
  constructor() {
    super("JIRA_UNAVAILABLE", "Jira is not configured", 503);
    this.name = "JiraUnavailableError";
  }
}

export class JiraOperationError extends ServiceError {
  constructor(message: string, public readonly detail: string) {
    super("JIRA_ERROR", message, 502);
    this.name = "JiraOperationError";
  }
}
