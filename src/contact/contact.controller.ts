import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { Public } from '../auth/public.decorator';
import { CurrentSiteCode } from '../common/decorators/site-code.decorator';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nhận form liên hệ, lưu DB và gửi email thông báo' })
  @ApiResponse({ status: 200, description: 'Gửi thành công' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async submit(
    @Body() dto: CreateContactDto,
    @CurrentSiteCode() siteCode?: string,
  ) {
    return this.contactService.submit(dto, siteCode || 'lermao');
  }
}
