import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { UserSearchDto } from '../user/dto/user-search.dto';
import { ChangeRoleDto } from '../user/dto/change-role.dto';
import { BanUserDto } from '../user/dto/ban-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  prisma = new PrismaClient();

  async getUsers(searchDto: UserSearchDto) {
    const { pageSize = 10, pageNumber = 0, keyword } = searchDto;

    // Build where conditions
    const where: any = {};
    if (keyword) {
      where.OR = [
        { full_name: { contains: keyword } },
        { email: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }

    // Get total count for pagination
    const totalElements = await this.prisma.user.count({ where });

    // Get users with their authorities
    const users = await this.prisma.user.findMany({
      where,
      include: {
        authority: true,
      },
      skip: pageNumber * pageSize,
      take: pageSize,
      orderBy: { created_date: 'desc' },
    });

    // Format response to match frontend expectations
    const content = users.map((user) => ({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      avatarUrl: user.ava_url,
      active: user.is_active,
      createdDate: user.created_date,
      updatedDate: user.updated_date,
      authorities: user.authority.map((auth) => ({
        role: auth.role,
      })),
    }));

    return {
      content,
      totalElements,
      pageable: {
        pageNumber,
        pageSize,
      },
    };
  }

  async changeUserRole(changeRoleDto: ChangeRoleDto) {
    const { username, role } = changeRoleDto;

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: username },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${username} not found`);
    }

    // Delete existing authorities for this user
    await this.prisma.authority.deleteMany({
      where: { user_id: username },
    });

    // Get the next available ID for authority
    const maxAuthority = await this.prisma.authority.findFirst({
      orderBy: { id: 'desc' },
    });
    const nextId = maxAuthority ? Number(maxAuthority.id) + 1 : 1;

    // Create new authority
    await this.prisma.authority.create({
      data: {
        id: BigInt(nextId),
        role,
        user_id: username,
      },
    });

    return {
      message: 'User role updated successfully',
      userId: username,
      newRole: role,
    };
  }

  async banUser(banUserDto: BanUserDto) {
    const { username } = banUserDto;

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: username },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${username} not found`);
    }

    // Toggle user active status
    const updatedUser = await this.prisma.user.update({
      where: { id: username },
      data: {
        is_active: !user.is_active,
        updated_date: new Date(),
      },
    });

    return {
      message: updatedUser.is_active
        ? 'User has been unbanned'
        : 'User has been banned',
      userId: username,
      isActive: updatedUser.is_active,
    };
  }
}
