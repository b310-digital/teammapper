import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import jwt from 'jsonwebtoken';

@Injectable()
export class PersonIdGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    const secret = process.env.JWT_SECRET;
    const cookie = req.cookies?.person_id;

    console.log('PersonIdGuard: Verifying person_id cookie:', cookie);
    console.log('Secret used:', secret)

    if (!cookie || !secret) {
      req.pid = undefined;
      return true;
    }

    try {
      const decoded = jwt.verify(cookie, secret) as { pid: string };
      req.pid = decoded.pid;
    } catch {
      req.pid = undefined;
    }

    return true;
  }
}