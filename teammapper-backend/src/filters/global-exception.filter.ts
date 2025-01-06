import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  Logger,
  NotFoundException,
} from '@nestjs/common'

// This is for any unhandled gateway and "internal" NestJS related errors - like if the gateway can't reach clients or things like that.
// It will try to always keep clients and their websockets alive and gracefully send errors over the wire, without revealing internal error reasons.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.getType()

    // Skip logging for NotFoundException in HTTP context
    // This is handled before anything else (and explicitly outside of ctx switch) to prevent _any_ error from logging
    if (ctx === 'http' && exception instanceof NotFoundException) {
      const response = host.switchToHttp().getResponse()
      return response.status(404).json({
        statusCode: 404,
        message: 'Not Found',
        timestamp: new Date().toISOString(),
      })
    }

    const errorDetails = {
      error: exception,
      type: exception?.constructor?.name || typeof exception,
      message: exception instanceof Error ? exception.message : 'Unknown error',
      stack: exception instanceof Error ? exception.stack : undefined,
      context: ctx,
    }

    this.logger.error(errorDetails)

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

        case 'ws': {
          const client = host.switchToWs().getClient()
          const error = {
            event: 'error',
            data: {
              message: 'Internal server error',
              timestamp: new Date().toISOString(),
            },
          }

          if (typeof client.emit === 'function') {
            client.emit('error', error)
          } else if (typeof client.send === 'function') {
            client.send(JSON.stringify(error))
          }
          break
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
