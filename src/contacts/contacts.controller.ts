import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Param,
  Patch,
  Delete,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ContactsService } from "./contacts.service";
import { CreateContactDto } from "./dto/create-contact.dto";

@Controller("contacts")
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private service: ContactsService) {}

  @Get()
  getAll(@Request() req: any) {
    return this.service.findAll(req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateContactDto) {
    return this.service.create(req.user.id, dto.name);
  }

  @Patch(":id")
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: CreateContactDto
  ) {
    return this.service.update(req.user.id, id, dto.name);
  }

  @Delete(":id")
  delete(@Request() req, @Param("id") id: string) {
    return this.service.delete(req.user.id, id);
  }
}
