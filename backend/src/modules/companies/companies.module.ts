import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompanyLogosController } from './company-logos.controller';
import { CompaniesService } from './companies.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CompaniesController, CompanyLogosController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
