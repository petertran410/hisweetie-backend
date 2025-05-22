import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { UserSearchDto } from '../user/dto/user-search.dto';
import { ChangeRoleDto } from '../user/dto/change-role.dto';
import { BanUserDto } from '../user/dto/ban-user.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'Get all users with pagination and search' })
  @ApiResponse({ status: 200, description: 'Returns paginated user list' })
  @UsePipes(new ValidationPipe({ transform: true }))
  getUsers(@Query() searchDto: UserSearchDto) {
    return this.adminService.getUsers(searchDto);
  }

  @Post('authority')
  @ApiOperation({ summary: 'Change user role/authority' })
  @ApiResponse({
    status: 200,
    description: 'User role has been successfully changed',
  })
  @UsePipes(new ValidationPipe())
  changeUserRole(@Body() changeRoleDto: ChangeRoleDto) {
    return this.adminService.changeUserRole(changeRoleDto);
  }

  @Post('ban')
  @ApiOperation({ summary: 'Ban/unban a user' })
  @ApiResponse({
    status: 200,
    description: 'User has been successfully banned/unbanned',
  })
  @UsePipes(new ValidationPipe())
  banUser(@Body() banUserDto: BanUserDto) {
    return this.adminService.banUser(banUserDto);
  }
}
