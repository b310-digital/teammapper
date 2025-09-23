import { HttpException, HttpStatus } from '@nestjs/common'

export class RateLimitExceededException extends HttpException {
  constructor(type: 'requests' | 'tokens') {
    const message = `${type === 'requests' ? 'Request' : 'Token'} limit exceeded.`

    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message,
        type,
      },
      HttpStatus.TOO_MANY_REQUESTS
    )
  }
}
