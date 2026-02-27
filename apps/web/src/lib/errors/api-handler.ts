import { NextRequest, NextResponse } from "next/server";
import { AppError } from "./app-error";

type RouteContext = { params: Promise<Record<string, string>> };

type RouteHandler = (
  request: NextRequest,
  context?: RouteContext,
) => Promise<NextResponse>;

/**
 * Wraps a Next.js route handler with consistent error handling.
 *
 * - AppError instances produce a JSON envelope with the correct status code.
 * - Unknown errors are logged and return a generic 500 response.
 * - Stack traces are never leaked to the client.
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: RouteContext) => {
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json(
          { error: { code: err.name, message: err.message } },
          { status: err.statusCode },
        );
      }

      console.error(`${request.method} ${request.nextUrl.pathname} failed:`, err);
      return NextResponse.json(
        { error: { code: "InternalError", message: "Internal server error" } },
        { status: 500 },
      );
    }
  };
}
