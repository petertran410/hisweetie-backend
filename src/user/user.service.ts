import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  prisma = new PrismaClient();

  // Helper function to generate unique ID without uuid
  private generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async getCurrentUser(userId: string) {
    if (!userId) {
      throw new NotFoundException('User ID not provided');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        authority: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return [
      {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        ava_url: user.ava_url,
        is_active: user.is_active,
        authorities: user.authority.map((auth) => ({ role: auth.role })),
      },
    ];
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: {
        authority: true,
      },
    });

    return users.map((user) => ({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      avatarUrl: user.ava_url,
      active: user.is_active,
      createdDate: user.created_date,
      authorities: user.authority.map((auth) => ({ role: auth.role })),
    }));
  }

  async create(createUserDto: CreateUserDto) {
    const { fullName, email, phone, password, address, avatarUrl, isActive } =
      createUserDto;

    // Check if user with email or phone already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this email or phone already exists',
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate unique ID using the helper function
    const userId = this.generateUniqueId();

    // Create user
    const user = await this.prisma.user.create({
      data: {
        id: userId,
        full_name: fullName,
        email,
        phone,
        password: hashedPassword,
        address,
        ava_url: avatarUrl,
        is_active: isActive ?? true,
        created_date: new Date(),
      },
    });

    // Create default authority (ROLE_USER)
    const maxAuthority = await this.prisma.authority.findFirst({
      orderBy: { id: 'desc' },
    });
    const nextId = maxAuthority ? Number(maxAuthority.id) + 1 : 1;

    await this.prisma.authority.create({
      data: {
        id: BigInt(nextId),
        role: 'ROLE_USER',
        user_id: userId,
      },
    });

    // Return user without password
    return {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      avatarUrl: user.ava_url,
      active: user.is_active,
      createdDate: user.created_date,
      authorities: [{ role: 'ROLE_USER' }],
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        authority: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      avatarUrl: user.ava_url,
      active: user.is_active,
      createdDate: user.created_date,
      updatedDate: user.updated_date,
      authorities: user.authority.map((auth) => ({ role: auth.role })),
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { fullName, email, phone, password, address, avatarUrl, isActive } =
      updateUserDto;

    // If email or phone is being updated, check for conflicts
    if (email || phone) {
      const conflictUser = await this.prisma.user.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            {
              OR: [email ? { email } : {}, phone ? { phone } : {}].filter(
                (condition) => Object.keys(condition).length > 0,
              ),
            },
          ],
        },
      });

      if (conflictUser) {
        throw new ConflictException(
          'User with this email or phone already exists',
        );
      }
    }

    // Prepare update data
    const updateData: any = {
      updated_date: new Date(),
    };

    if (fullName !== undefined) updateData.full_name = fullName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (avatarUrl !== undefined) updateData.ava_url = avatarUrl;
    if (isActive !== undefined) updateData.is_active = isActive;

    // Hash password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update user
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        authority: true,
      },
    });

    return {
      id: updatedUser.id,
      fullName: updatedUser.full_name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      address: updatedUser.address,
      avatarUrl: updatedUser.ava_url,
      active: updatedUser.is_active,
      createdDate: updatedUser.created_date,
      updatedDate: updatedUser.updated_date,
      authorities: updatedUser.authority.map((auth) => ({ role: auth.role })),
    };
  }

  async remove(id: string) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Delete user authorities first
    await this.prisma.authority.deleteMany({
      where: { user_id: id },
    });

    // Delete user
    await this.prisma.user.delete({
      where: { id },
    });

    return {
      message: `User with ID ${id} has been deleted`,
    };
  }
}
