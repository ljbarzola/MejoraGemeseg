import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: {
        fullName: createUserDto.fullName,
        email: createUserDto.email,
        documentNumber: createUserDto.documentNumber,
        position: createUserDto.position,
        departmentId: createUserDto.departmentId,
        roleId: createUserDto.roleId,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      include: {
        department: true,
        role: true,
      },
    });
  }

  async updateDepartment(id: number, departmentId: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return this.prisma.user.update({
      where: { id },
      data: { departmentId },
    });
  }

  async softDelete(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
