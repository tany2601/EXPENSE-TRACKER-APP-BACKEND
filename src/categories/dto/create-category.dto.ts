import { IsString } from "class-validator";

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsString()
  iconName: string;

  @IsString()
  color: string;
}
