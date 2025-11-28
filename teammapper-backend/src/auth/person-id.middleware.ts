import { Injectable, NestMiddleware } from '@nestjs/common'
import jwt from 'jsonwebtoken'
import { Request } from '../map/types'

@Injectable()
export class PersonIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: () => void) {
    const secret = process.env.JWT_SECRET
    const cookie = req.cookies?.person_id

    console.warn('Secret and person_id cookie: ' + secret + ' / ' + cookie)

    req.pid = undefined

    if (secret && cookie) {
      try {
        const decoded = jwt.verify(cookie, secret, {
          algorithms: ['HS256'],
        }) as { pid: string }
        req.pid = decoded.pid
        console.log('Decoded person_id: ' + req.pid)
      } catch {
        console.warn('Invalid person_id cookie')
      }
    } else {
      console.warn('No JWT_SECRET or person_id cookie set')
    }

    next()
  }
}
