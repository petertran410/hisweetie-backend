import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ClientUserType } from './dto/create-client-user.dto';

@Injectable()
export class ClientUserService {
  prisma = new PrismaClient();

  async findAll() {
    const data = await this.prisma.client_user.findMany();

    return data;
  }

  async findOne(id: number): Promise<ClientUserType> {
    const user: ClientUserType = await this.prisma.client_user.findUnique({
      where: { client_id },
    });
    return user;
  }

  async findName(clientName) {
    let data = await this.prisma.client_user.findMany({
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
  }: ClientUserType): Promise<ClientUserType> {
    const client_user: any = await this.prisma.client_user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    });
    return client_user;
  }

  async validate(email: string, password: string) {
    const client_user: any = await this.prisma.client_user.findFirst({
      where: { email },
    });
    if (client_user) {
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
    const hashedPassword: string = await bcrypt.hash(data.pass_word, 20);
    const client_user: any = await this.prisma.client_user.create({
      data: { ...data, pass_word: hashedPassword },
    });
    return client_user;
  }

  async update(client_id: number, data: ClientUserType) {
    const client_user: ClientUserType = await this.prisma.client_user.update({
      where: { client_id },
      data,
    });
    return client_user;
  }

  async changePassword(
    id: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<ClientUserType | Error> {
    const user: ClientUserType = await this.prisma.client_user.findUnique({
      where: { client_id },
    });
    if (user) {
      if (await bcrypt.compare(oldPassword, user.pass_word)) {
        const hashedNewPassword: string = await bcrypt.hash(newPassword, 10);
        const updatedUser: ClientUserType =
          await this.prisma.client_user.update({
            where: { client_id },
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
    const isExisted: ClientUserType = await this.findOne(id);
    if (isExisted) {
      const user: ClientUserType = await this.prisma.client_user.delete({
        where: { client_id },
      });
      return user;
    } else throw new NotFoundException();
  }
}
