import logging
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

from app.shared.logging import log_event

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        code: str = "APP_ERROR",
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        self.status_code = status_code
        self.message = message
        self.code = code
        self.details = details or []
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, message: str = "Not found") -> None:
        super().__init__(404, message, "NOT_FOUND")


class ValidationError(AppError):
    def __init__(
        self,
        message: str = "Validation failed",
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(400, message, "VALIDATION_ERROR", details=details)


class BusinessRuleError(AppError):
    def __init__(self, message: str = "Business rule violation") -> None:
        super().__init__(400, message, "BUSINESS_RULE_VIOLATION")


class ConflictError(AppError):
    def __init__(self, message: str = "Conflict") -> None:
        super().__init__(409, message, "CONFLICT")


async def app_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    error_payload: dict[str, Any] = {"code": exc.code, "message": exc.message}
    if exc.details:
        error_payload["details"] = exc.details
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": error_payload},
    )


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    correlation_id = request.headers.get("X-Correlation-Id")
    actor_id = request.headers.get("X-Actor-Id")
    actor_type = request.headers.get("X-Actor-Type")
    log_event(
        logger,
        level=logging.ERROR,
        event="http.request.failed",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=500,
        actor_id=actor_id,
        actor_type=actor_type,
        correlation_id=correlation_id,
        error=str(exc),
    )
    response: Response = JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
    )
    if isinstance(request_id, str) and request_id:
        response.headers["X-Request-Id"] = request_id
    return response
