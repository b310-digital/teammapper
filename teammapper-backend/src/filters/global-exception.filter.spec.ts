import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { GlobalExceptionFilter } from './global-exception.filter'

interface FakeResponse {
  status: jest.Mock
  json: jest.Mock
}

const createHttpHost = (response: FakeResponse): ArgumentsHost =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => response }),
  }) as unknown as ArgumentsHost

const createResponse = (): FakeResponse => {
  const response: FakeResponse = {
    status: jest.fn(),
    json: jest.fn(),
  }
  response.status.mockReturnValue(response)
  response.json.mockReturnValue(response)
  return response
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    filter = new GlobalExceptionFilter()
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation()
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('forwards a BadRequestException unchanged to the client', () => {
    const response = createResponse()
    const issues = [{ kind: 'schema', type: 'string', message: 'invalid' }]
    const exception = new BadRequestException(issues)

    filter.catch(exception, createHttpHost(response))

    expect({
      status: response.status.mock.calls[0][0],
      body: response.json.mock.calls[0][0],
    }).toEqual({
      status: HttpStatus.BAD_REQUEST,
      body: exception.getResponse(),
    })
  })

  it('does not log HttpException — they are intentional client-facing flow', () => {
    filter.catch(
      new BadRequestException('bad'),
      createHttpHost(createResponse())
    )
    filter.catch(new NotFoundException(), createHttpHost(createResponse()))
    filter.catch(
      new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT),
      createHttpHost(createResponse())
    )

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('forwards a custom HttpException status', () => {
    const response = createResponse()
    filter.catch(
      new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT),
      createHttpHost(response)
    )

    expect(response.status).toHaveBeenCalledWith(HttpStatus.I_AM_A_TEAPOT)
  })

  it('returns generic 500 body for non-HttpException', () => {
    const response = createResponse()
    filter.catch(new Error('boom'), createHttpHost(response))

    expect({
      status: response.status.mock.calls[0][0],
      bodyMessage: response.json.mock.calls[0][0].message,
    }).toEqual({
      status: 500,
      bodyMessage: 'Internal server error',
    })
  })

  it('does not include the raw exception object in the log payload', () => {
    filter.catch(
      new Error('boom: secret-token-leak'),
      createHttpHost(createResponse())
    )

    expect(errorSpy.mock.calls[0][0]).not.toHaveProperty('error')
  })

  it('logs only allowlisted fields for non-HttpException', () => {
    const exception = new Error('boom')
    filter.catch(exception, createHttpHost(createResponse()))

    expect(Object.keys(errorSpy.mock.calls[0][0]).sort()).toEqual([
      'context',
      'message',
      'stack',
      'type',
    ])
  })
})
