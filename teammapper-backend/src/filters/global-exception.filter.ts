import { ExceptionFilter, Catch, ArgumentsHost, Logger, HttpException } from '@nestjs/common';

// This is for any unhandled gateway and "internal" NestJS related errors - like if the gateway can't reach clients or things like that.
// It will try to always keep clients and their websockets alive and gracefully send errors over the wire, without revealing internal error reasons.
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: Error | HttpException | unknown, host: ArgumentsHost) {
    const ctx = host.getType();

    this.logger.error({
      error: exception,
      type: exception?.constructor?.name || typeof exception,
      message: exception?.message || 'Unknown error',
      stack: exception?.stack,
      context: ctx,
    });

    try {
      switch (ctx) {
        case 'http': {
          const response = host.switchToHttp().getResponse();
          return response.status(500).json({
            statusCode: 500,
            message: 'Internal server error',
            timestamp: new Date().toISOString(),
          });
        }

        case 'ws': {
          const client = host.switchToWs().getClient();
          const error = {
            event: 'error',
            data: {
              message: 'Internal server error',
              timestamp: new Date().toISOString(),
            },
          };

          if (typeof client.emit === 'function') {
            client.emit('error', error);
          } else if (typeof client.send === 'function') {
            client.send(JSON.stringify(error));
          }
          break;
        }

        default: {
          // Handle any runtime errors outside HTTP/WS contexts
          this.logger.error(`Unhandled exception type: ${ctx}`);
          // Emit to process handler as last resort
          process.emit('uncaughtException', exception);
        }
      }
    } catch (handlerError) {
      // If the error handler itself fails, log it and emit to process
      this.logger.error('Global exception handler failed: ', handlerError);
      process.emit('uncaughtException', exception);
    }
  }
}