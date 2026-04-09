import { Injectable } from "@nestjs/common";
import { Resend } from "resend";

@Injectable()
export class MailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  async sendOtp(
    email: string,
    otp: string,
    type: "PASSWORD_RESET" | "EMAIL_VERIFY"
  ) {
    const subject =
      type === "PASSWORD_RESET"
        ? "Reset your Rupexo password"
        : "Verify your Rupexo email";

    const title =
      type === "PASSWORD_RESET"
        ? "Password Reset Code"
        : "Email Verification Code";

    await this.resend.emails.send({
      from: process.env.MAIL_FROM!,
      to: email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px">
          <h2>${title}</h2>
          <p>Your 4-digit code is:</p>
          <div style="
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            margin: 20px 0;
          ">
            ${otp}
          </div>
          <p>This code expires in 5 minutes.</p>
          <p>If you didn’t request this, you can safely ignore this email.</p>
        </div>
      `,
    });
  }
}
