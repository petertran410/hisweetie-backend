import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  private readonly logger = new Logger(FacebookStrategy.name);

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

    this.logger.log('Facebook Strategy initialized');
    this.logger.log(`Callback URL: ${callbackURL}`);
  }

  async authenticate(req: Request, options?: any) {
    this.logger.log('Facebook authenticate called', req.query);

    if (req.query.error) {
      const errorDescription =
        typeof req.query.error_description === 'string'
          ? req.query.error_description
          : 'User denied authorization';

      this.logger.warn(
        `Facebook OAuth error: ${req.query.error} - ${errorDescription}`,
      );
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
    this.logger.log('Facebook validate called', { profileId: profile?.id });

    try {
      if (!profile || !profile.id) {
        this.logger.error('Facebook profile is null or missing ID');
        return done(new Error('Facebook profile data is incomplete'), null);
      }

      const { id, name, emails, photos, displayName } = profile;

      if (!emails || !emails[0] || !emails[0].value) {
        this.logger.error('Facebook profile missing email');
        return done(new Error('Email permission required'), null);
      }

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
        fullName = emails[0].value.split('@')[0] || 'User';
      }

      const user = {
        provider: 'facebook',
        providerId: id,
        email: emails[0].value,
        full_name: fullName,
        avatar_url: photos?.[0]?.value,
      };

      this.logger.log('Facebook user validated successfully', {
        providerId: user.providerId,
        email: user.email,
        fullName: user.full_name,
      });

      done(null, user);
    } catch (error) {
      this.logger.error('Error in Facebook validate:', error);
      done(error, null);
    }
  }
}
