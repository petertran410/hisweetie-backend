import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ClientUserType } from './dto/create-client-user.dto';

@Injectable()
export class ClientUserService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const data = await this.prisma.client_user.findMany();
    return data;
  }

  async findOne(id: number): Promise<ClientUserType | null> {
    const user = await this.prisma.client_user.findUnique({
      where: { client_id: id },
    });
    return user;
  }

  async findName(clientName: string) {
    const data = await this.prisma.client_user.findMany({
      where: {
        full_name: {
          contains: clientName,
        },
      },
    });
    return data;
  }

  async checkExistence({
    email,
    phone,
  }: ClientUserType): Promise<ClientUserType | null> {
    const client_user = await this.prisma.client_user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    });
    return client_user;
  }

  async validate(email: string, password: string) {
    const client_user = await this.prisma.client_user.findFirst({
      where: { email },
    });
    if (client_user && client_user.pass_word) {
      if (await bcrypt.compare(password, client_user.pass_word)) {
        return client_user;
      } else {
        throw new UnauthorizedException('Incorrect email or password!');
      }
    } else {
      return null;
    }
  }

  async create(data: ClientUserType) {
    if (!data.pass_word) {
      throw new Error('Password is required');
    }
    const hashedPassword = await bcrypt.hash(data.pass_word, 10);
    const client_user = await this.prisma.client_user.create({
      data: { ...data, pass_word: hashedPassword },
    });
    return client_user;
  }

  async update(client_id: number, data: Partial<ClientUserType>) {
    const existingUser = await this.prisma.client_user.findUnique({
      where: { client_id },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with ID ${client_id} not found`);
    }

    if (data.email || data.phone) {
      const conflictUser = await this.prisma.client_user.findFirst({
        where: {
          AND: [
            { client_id: { not: client_id } },
            {
              OR: [
                data.email ? { email: data.email } : {},
                data.phone ? { phone: data.phone } : {},
              ].filter((condition) => Object.keys(condition).length > 0),
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

    const updatedUser = await this.prisma.client_user.update({
      where: { client_id },
      data,
    });

    return updatedUser;
  }

  async changePassword(
    id: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<ClientUserType | Error> {
    const user = await this.prisma.client_user.findUnique({
      where: { client_id: id },
    });
    if (user && user.pass_word) {
      if (await bcrypt.compare(oldPassword, user.pass_word)) {
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        const updatedUser = await this.prisma.client_user.update({
          where: { client_id: id },
          data: { pass_word: hashedNewPassword },
        });
        return updatedUser;
      } else {
        throw new UnauthorizedException('Incorrect password!');
      }
    } else {
      throw new NotFoundException();
    }
  }

  async delete(id: number): Promise<ClientUserType | Error> {
    const isExisted = await this.findOne(id);
    if (isExisted) {
      const user = await this.prisma.client_user.delete({
        where: { client_id: id },
      });
      return user;
    } else throw new NotFoundException();
  }
}
