import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Query,
  Delete,
} from '@nestjs/common';
import { ClientUserService } from './client_user.service';
import { ClientJwtAuthGuard } from '../auth/client-auth/client-jwt-auth.guard';
import { CurrentClient } from '../auth/client-auth/current-client.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { UpdateClientUserDto } from './dto/create-client-user.dto';

@ApiTags('client-user')
@Controller('client-user')
@UseGuards(ClientJwtAuthGuard)
@ApiBearerAuth()
export class ClientUserController {
  constructor(
    private readonly clientUserService: ClientUserService,
    private configService: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Get orders of current client user' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiResponse({
    status: 200,
    description: 'Returns user orders',
  })
  @Get('my-orders')
  async getMyOrders(
    @CurrentClient() client: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
  ) {
    return this.clientUserService.getMyOrders(
      client.clientId,
      parseInt(page),
      parseInt(limit),
      status,
    );
  }

  @Patch('profile')
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

  @Get()
  findAll() {
    return this.clientUserService.findAll();
  }

  @Get(':clientName')
  findName(@Param('clientName') clientName) {
    return this.clientUserService.findName(clientName);
  }

  @Delete('orders/:orderId/cancel')
  @ApiOperation({ summary: 'Cancel order by deleting KiotViet invoice' })
  @ApiResponse({ status: 200, description: 'Order cancelled successfully' })
  async cancelOrder(
    @CurrentClient() client: any,
    @Param('orderId') orderId: string,
  ) {
    return this.clientUserService.cancelOrder(client.clientId, orderId);
  }
}
