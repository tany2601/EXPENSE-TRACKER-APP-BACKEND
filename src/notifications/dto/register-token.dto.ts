import { IsIn, IsString, MinLength } from "class-validator";

export class RegisterTokenDto {
  @IsString()
  @MinLength(10)
  fcmToken: string;

  @IsString()
  deviceId: string;

  @IsIn(["android", "ios"])
  platform: "android" | "ios";
}
