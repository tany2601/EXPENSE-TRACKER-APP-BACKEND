import { IsString, IsNotEmpty } from "class-validator";

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
