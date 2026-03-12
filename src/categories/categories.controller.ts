import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@UseGuards(JwtAuthGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private service: CategoriesService) {}

  @Get()
  getAll(@Req() req) {
    return this.service.getAll(req.user.id);
  }

  @Post()
  create(@Req() req, @Body() dto: CreateCategoryDto) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(":id")
  update(@Req() req, @Param("id") id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.update(req.user.id, id, dto);
  }

  @Delete(":id")
  delete(@Req() req, @Param("id") id: string) {
    return this.service.delete(req.user.id, id);
  }
}

