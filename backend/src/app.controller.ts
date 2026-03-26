import { Body, Controller, Get, Logger, Post, Res } from '@nestjs/common';
import { OpenClawService } from './openclaw.service';
import type { Response } from 'express';

interface ChatRequestBody {
  message: string;
}

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(private readonly openClawService: OpenClawService) {}

  @Get('health/openclaw')
  getOpenClawHealth(): { connected: boolean; url: string | undefined } {
    return this.openClawService.getStatus();
  }

  @Post('chat')
  async sendMessage(@Body() body: ChatRequestBody, @Res() res: Response) {
    this.logger.log(`HTTP /chat request: "${body.message}"`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      await this.openClawService.sendMessageStream(
        body.message,
        (content, final) => {
          res.write(`data: ${JSON.stringify({ content, final })}\n\n`);
        },
      );
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ error: (err as Error).message })}\n\n`,
      );
    }

    res.end();
  }
}
