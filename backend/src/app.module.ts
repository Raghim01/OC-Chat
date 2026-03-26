import { Module } from '@nestjs/common';
import { OpenClawController } from './openclaw/openclaw.controller';
import { OpenClawService } from './openclaw/openclaw.service';

@Module({
  imports: [],
  controllers: [OpenClawController],
  providers: [OpenClawService],
})
export class AppModule {}
