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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ClientUserType } from './dto/create-client-user.dto';

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
}
[];
