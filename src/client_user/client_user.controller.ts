import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ClientUserService } from './client_user.service';
import { ClientJwtAuthGuard } from '../auth/client-auth/client-jwt-auth.guard';
import { CurrentClient } from '../auth/client-auth/current-client.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import {
  ClientUserType,
  UpdateClientUserDto,
} from './dto/create-client-user.dto';

@ApiTags('client-user')
@Controller('client-user')
export class ClientUserController {
  constructor(
    private readonly clientUserService: ClientUserService,
    private configService: ConfigService,
  ) {}

  @Get()
  findAll() {
    return this.clientUserService.findAll();
  }

  @Get(':clientName')
  findName(@Param('clientName') clientName) {
    return this.clientUserService.findName(clientName);
  }

  @Patch('profile')
  @UseGuards(ClientJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current client user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
  })
  @UsePipes(new ValidationPipe())
  async updateProfile(
    @CurrentClient() client: any,
    @Body() updateData: UpdateClientUserDto,
  ) {
    const updatedUser = await this.clientUserService.update(
      client.clientId,
      updateData,
    );

    return {
      message: 'Profile updated successfully',
      user: {
        client_id: updatedUser.client_id,
        full_name: updatedUser.full_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        detailed_address: updatedUser.detailed_address,
        province: updatedUser.province,
        district: updatedUser.district,
        ward: updatedUser.ward,
      },
    };
  }
}
