import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

/** All anonymous callers share an allowance; no IP address identifies them. */
@Injectable()
export class MapDuplicationThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(): Promise<string> {
    return 'map-duplication'
  }
}
