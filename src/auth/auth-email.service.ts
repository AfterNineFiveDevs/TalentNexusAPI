import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from 'src/config/environment';

type AuthEmailKind = 'verification' | 'password-reset';

@Injectable()
export class AuthEmailService {
  private readonly logger = new Logger(AuthEmailService.name);
  private readonly provider: 'console' | 'brevo';
  private readonly webAppUrl: string;
  private readonly brevoApiKey: string | undefined;
  private readonly fromEmail: string | undefined;
  private readonly fromName: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.provider = config.getOrThrow('EMAIL_PROVIDER', { infer: true });
    this.webAppUrl = config
      .getOrThrow('WEB_APP_URL', { infer: true })
      .replace(/\/$/, '');
    this.brevoApiKey = config.get('BREVO_API_KEY', { infer: true });
    this.fromEmail = config.get('MAIL_FROM_EMAIL', { infer: true });
    this.fromName = config.getOrThrow('MAIL_FROM_NAME', { infer: true });
  }

  sendVerification(email: string, token: string): Promise<void> {
    return this.send('verification', email, token);
  }

  sendPasswordReset(email: string, token: string): Promise<void> {
    return this.send('password-reset', email, token);
  }

  private async send(
    kind: AuthEmailKind,
    email: string,
    token: string,
  ): Promise<void> {
    const content = this.createContent(kind, token);
    if (this.provider === 'console') {
      this.logger.log(`${content.subject}: ${content.url}`);
      return;
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': this.brevoApiKey!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: this.fromEmail!, name: this.fromName },
        to: [{ email }],
        subject: content.subject,
        htmlContent: [
          '<p>Use the secure link below to continue:</p>',
          `<p><a href="${content.url}">${content.linkLabel}</a></p>`,
          '<p>If you did not request this, you can ignore this email.</p>',
        ].join(''),
      }),
    });

    if (!response.ok) {
      throw new Error(`Brevo delivery failed with status ${response.status}`);
    }
  }

  private createContent(
    kind: AuthEmailKind,
    token: string,
  ): {
    subject: string;
    linkLabel: string;
    url: string;
  } {
    const encodedToken = encodeURIComponent(token);
    if (kind === 'verification') {
      return {
        subject: 'Verify your Talent Nexus email',
        linkLabel: 'Verify email',
        url: `${this.webAppUrl}/verify-email#token=${encodedToken}`,
      };
    }
    return {
      subject: 'Reset your Talent Nexus password',
      linkLabel: 'Reset password',
      url: `${this.webAppUrl}/reset-password#token=${encodedToken}`,
    };
  }
}
