import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL = configService.get<string>('GOOGLE_CALLBACK_URL');

    if (!clientID || !clientSecret || !callbackURL) {
      throw new Error('Google OAuth credentials are not configured');
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, name, emails, photos } = profile;

    // Xử lý tên để tránh undefined
    const givenName = name?.givenName?.trim() || '';
    const familyName = name?.familyName?.trim() || '';

    let fullName = '';
    if (givenName && familyName) {
      fullName = `${givenName} ${familyName}`;
    } else if (givenName) {
      fullName = givenName;
    } else if (familyName) {
      fullName = familyName;
    } else {
      fullName =
        profile.displayName?.trim() ||
        emails[0]?.value?.split('@')[0] ||
        'User';
    }

    const user = {
      provider: 'google',
      providerId: id,
      email: emails[0].value,
      full_name: fullName,
      avatar_url: photos[0].value,
    };
    done(null, user);
  }
}
