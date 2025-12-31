import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyResetOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(4, 4)
  otp: string;
}
