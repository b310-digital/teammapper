import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common'

// Catches unhandled errors from the HTTP pipeline. The Yjs websocket
// gateway is a raw ws.Server mounted outside Nest's filter pipeline, so it
// handles its own connection errors directly and never reaches this filter.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.getType()

    // HttpException is intentional client-facing flow (validation, auth, not-found...).
    // Forward its status/body unchanged and don't log `util.inspect` the
    // exception expands `.response` (raw user input, secrets) and any
    // `QueryFailedError.parameters` into server logs.
    if (ctx === 'http' && exception instanceof HttpException) {
      const response = host.switchToHttp().getResponse()
      return response
        .status(exception.getStatus())
        .json(exception.getResponse())
    }

    this.logger.error({
      type: exception?.constructor?.name || typeof exception,
      message: exception instanceof Error ? exception.message : 'Unknown error',
      stack: exception instanceof Error ? exception.stack : undefined,
      context: ctx,
    })

    try {
      switch (ctx) {
        case 'http': {
          const response = host.switchToHttp().getResponse()
          return response.status(500).json({
            statusCode: 500,
            message: 'Internal server error',
            timestamp: new Date().toISOString(),
          })
        }

        default: {
          // Handle any runtime errors outside HTTP/WS contexts
          this.logger.error(`Unhandled exception type: ${ctx}`)
          // Forward to the global error handler
          if (exception instanceof Error) {
            process.emitWarning(exception)
          } else {
            process.emitWarning(new Error(String(exception)), 'UnhandledError')
          }
        }
      }
    } catch (handlerError) {
      // If the error handler itself fails, log it and emit to process
      this.logger.error('Global exception handler failed: ', handlerError)
      if (handlerError instanceof Error) {
        process.emitWarning(handlerError)
      } else {
        process.emitWarning(new Error(String(handlerError)), 'HandlerError')
      }
    }
  }
}
