import logging

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, status_code: int, message: str, code: str = "APP_ERROR") -> None:
        self.status_code = status_code
        self.message = message
        self.code = code
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, message: str = "Not found") -> None:
        super().__init__(404, message, "NOT_FOUND")


class ValidationError(AppError):
    def __init__(self, message: str = "Validation failed") -> None:
        super().__init__(400, message, "VALIDATION_ERROR")


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("%s %s failed: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
    )
