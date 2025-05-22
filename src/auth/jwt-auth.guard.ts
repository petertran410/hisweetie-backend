import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    console.log('JwtAuthGuard called'); // Debug log
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    console.log('JWT Guard - Error:', err); // Debug log
    console.log('JWT Guard - User:', user); // Debug log
    console.log('JWT Guard - Info:', info); // Debug log

    if (err || !user) {
      throw err || new Error('Authentication failed');
    }
    return user;
  }
}
