import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly resend = new Resend(process.env.RESEND_API_KEY);
  private readonly logger = new Logger(MailService.name);

  async sendResetOtp(email: string, otp: string) {
    console.log('MAIL SERVICE CALLED →', email, otp);
    try {
      await this.resend.emails.send({
        from: process.env.MAIL_FROM!,
        to: email,
        subject: 'Your Lumina password reset code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 420px; margin: auto;">
            <h2>Password Reset</h2>
            <p>Use the code below to reset your password:</p>
            <div style="
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 6px;
              margin: 24px 0;
            ">
              ${otp}
            </div>
            <p>This code expires in <b>5 minutes</b>.</p>
            <p style="color:#888;font-size:12px">
              If you didn’t request this, you can safely ignore this email.
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error('Failed to send OTP email', err);
      // IMPORTANT: do NOT throw → forgot-password must stay silent
    }
  }
}
