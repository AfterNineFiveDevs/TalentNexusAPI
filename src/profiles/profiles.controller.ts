import { Body, Controller, Get, Patch, UseInterceptors } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  profileSchema,
  UpdateProfileDto,
  type AuthenticatedUser,
} from '@talent-nexus/contracts';
import { CurrentUser } from '../@decorators/current-user.decorator';
import { AdminNoStoreInterceptor } from '../admin-auth/admin-no-store.interceptor';
import { detailSchema } from '../common/swagger/response-schemas';
import { ProfilesService } from './profiles.service';

@ApiTags('Candidate profile')
@ApiBearerAuth()
@Controller('me/profile')
@UseInterceptors(AdminNoStoreInterceptor)
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Current candidate account required' })
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @ApiOperation({ summary: 'Read your own profile and its completeness' })
  @ApiResponse({ status: 200, schema: detailSchema(profileSchema) })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.get(user.id);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update your own profile; only sent fields change, null clears',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, schema: detailSchema(profileSchema) })
  @ApiResponse({ status: 400, description: 'Invalid or unknown profile field' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profiles.update(user.id, dto);
  }
}
