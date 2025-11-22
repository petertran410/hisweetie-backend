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
      scope: ['email', 'public_profile'],
      profileFields: [
        'id',
        'emails',
        'name',
        'picture.type(large)',
        'displayName',
        'first_name',
        'last_name',
      ],
      passReqToCallback: true,
      enableProof: true,
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
    this.logger.log('Facebook validate called', {
      profileId: profile?.id,
      profileData: JSON.stringify(profile, null, 2),
    });

    try {
      if (!profile || !profile.id) {
        this.logger.error('Facebook profile is null or missing ID');
        return done(new Error('Facebook profile data is incomplete'), null);
      }

      const { id, name, emails, photos, displayName } = profile;

      const userEmail = emails?.[0]?.value || null;

      const givenName = name?.givenName?.trim() || '';
      const familyName = name?.familyName?.trim() || '';
      const middleName = name?.middleName?.trim() || '';

      let fullName = '';
      if (givenName && familyName) {
        fullName = middleName
          ? `${givenName} ${middleName} ${familyName}`
          : `${givenName} ${familyName}`;
      } else if (givenName) {
        fullName = givenName;
      } else if (familyName) {
        fullName = familyName;
      } else if (displayName?.trim()) {
        fullName = displayName.trim();
      } else {
        fullName = `Facebook User`;
      }

      const user = {
        provider: 'facebook',
        providerId: id,
        email: userEmail,
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
