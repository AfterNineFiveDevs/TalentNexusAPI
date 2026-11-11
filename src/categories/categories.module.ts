import { Module } from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';
import {
  AdminCategoriesController,
  CategoriesController,
  CategorySubscriptionsController,
} from './categories.controller';
@Module({
  providers: [CategoriesRepository, CategoriesService],
  controllers: [
    AdminCategoriesController,
    CategoriesController,
    CategorySubscriptionsController,
  ],
})
export class CategoriesModule {}
