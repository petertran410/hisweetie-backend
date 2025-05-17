import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

// @ApiTags('user')
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private configService: ConfigService,
  ) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  // @ApiConsumes('multipart/form-data')
  // // @ApiBody({
  // //   type: uploadDTO,
  // // })
  // @UseInterceptors(
  //   FileInterceptor('avatar', {
  //     storage: diskStorage({
  //       destination: process.cwd() + '/public/img',
  //       filename: (req, file, callback) =>
  //         callback(null, new Date().getTime() + '_' + file.originalname),
  //     }),
  //   }),
  // )
  // @Post('upload')
  // upload(@UploadedFiles() file: Express.Multer.File[]) {
  //   return file;
  // }

  @Get('search/:uName')
  findName(@Param('uName') uName) {
    return this.userService.findName(uName);
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(+id);
  }
}
