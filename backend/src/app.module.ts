import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ChatGateway } from './chat.gateway';
import { OpenClawService } from './openclaw.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [ChatGateway, OpenClawService],
})
export class AppModule {}
