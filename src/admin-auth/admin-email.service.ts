import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminEmailService {
  constructor(private readonly config: ConfigService) {}
  async sendInvitation(email: string, token: string): Promise<void> {
    const base = this.config
      .getOrThrow<string>('ADMIN_APP_URL')
      .replace(/\/$/, '');
    const url = `${base}/accept-invitation#token=${encodeURIComponent(token)}`;
    if (this.config.getOrThrow('EMAIL_PROVIDER') === 'console') {
      // Credential-bearing links are deliberately never written to application logs.
      throw new Error(
        'Admin invitations require Brevo or the local email simulation; console delivery is unavailable',
      );
    }
    const response = await fetch(
      `${this.config.getOrThrow<string>('BREVO_API_URL').replace(/\/$/, '')}/smtp/email`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          accept: 'application/json',
          'api-key': this.config.getOrThrow<string>('BREVO_API_KEY'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            email: this.config.getOrThrow<string>('MAIL_FROM_EMAIL'),
            name: this.config.getOrThrow<string>('MAIL_FROM_NAME'),
          },
          to: [{ email }],
          subject: 'Your TalentNexus administrator invitation',
          htmlContent: `<p>You have been invited to administer TalentNexus.</p><p><a href="${url}">Accept invitation</a></p><p>This link expires in 24 hours. An authenticator is required before admin access.</p>`,
        }),
      },
    );
    if (!response.ok)
      throw new Error(`Admin email delivery failed (${response.status})`);
  }
}
