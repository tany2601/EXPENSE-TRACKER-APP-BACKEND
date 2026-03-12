import { IsString } from "class-validator";

export class PaySplitDto {
  @IsString()
  participantId: string;
}
