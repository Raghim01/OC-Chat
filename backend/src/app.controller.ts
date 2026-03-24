import { Body, Controller, Get, Post } from '@nestjs/common';
import { OpenClawService } from './openclaw.service';

interface ChatRequestBody {
  message: string;
}

interface ChatResponseBody {
  response: string;
}

@Controller()
export class AppController {
  constructor(private readonly openClawService: OpenClawService) {}

  @Get('health/openclaw')
  getOpenClawHealth(): { connected: boolean; url: string | undefined } {
    return this.openClawService.getStatus();
  }

  @Post('chat')
  async chat(@Body() body: ChatRequestBody): Promise<ChatResponseBody> {
    const response = await this.openClawService.sendMessage(body.message);
    return { response };
  }
}
