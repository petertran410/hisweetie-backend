import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(private configService: ConfigService) {
    const clientID = configService.get<string>('FACEBOOK_APP_ID');
    const clientSecret = configService.get<string>('FACEBOOK_APP_SECRET');
    const callbackURL = configService.get<string>('FACEBOOK_CALLBACK_URL');

    if (!clientID || !clientSecret || !callbackURL) {
      throw new Error('Facebook OAuth credentials are not configured');
    }

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email'],
      profileFields: [
        'id',
        'emails',
        'name',
        'picture.type(large)',
        'displayName',
      ],
      passReqToCallback: true,
    });
  }

  async authenticate(req: Request, options?: any) {
    if (req.query.error) {
      const errorDescription =
        typeof req.query.error_description === 'string'
          ? req.query.error_description
          : 'User denied authorization';
      return this.fail({ message: errorDescription }, 401);
    }
    return super.authenticate(req, options);
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: any, user: any, info?: any) => void,
  ): Promise<any> {
    const { id, name, emails, photos, displayName } = profile;

    const givenName = name?.givenName?.trim() || '';
    const familyName = name?.familyName?.trim() || '';

    let fullName = '';
    if (givenName && familyName) {
      fullName = `${givenName} ${familyName}`;
    } else if (givenName) {
      fullName = givenName;
    } else if (familyName) {
      fullName = familyName;
    } else if (displayName?.trim()) {
      fullName = displayName.trim();
    } else {
      fullName = emails?.[0]?.value?.split('@')[0] || 'User';
    }

    const user = {
      provider: 'facebook',
      providerId: id,
      email: emails?.[0]?.value,
      full_name: fullName,
      avatar_url: photos?.[0]?.value,
    };
    done(null, user);
  }
}
