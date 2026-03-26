import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { OpenClawService } from './openclaw.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [OpenClawService],
})
export class AppModule {}
