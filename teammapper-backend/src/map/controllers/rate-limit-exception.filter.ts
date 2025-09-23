import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common'
import { Response } from 'express'
import { RateLimitExceededException } from './rate-limit.exception'

@Catch(RateLimitExceededException)
export class RateLimitExceptionFilter implements ExceptionFilter {
  catch(exception: RateLimitExceededException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse() as {
      error: string
      type: string
      message: string
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      error: exceptionResponse.error,
      message: exceptionResponse.message,
      details: {
        type: exceptionResponse.type,
      },
    })
  }
}
