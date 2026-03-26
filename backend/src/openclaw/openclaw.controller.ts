import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { OpenClawService } from './openclaw.service';
import type {
  ChatRequestBody,
  HistoryMessage,
} from '../interfaces/ws.interfaces';

@Controller()
export class OpenClawController {
  private readonly logger = new Logger(OpenClawController.name);

  constructor(private readonly openClawService: OpenClawService) {}

  @Get('health/openclaw')
  getOpenClawHealth(): { connected: boolean; url: string | undefined } {
    return this.openClawService.getStatus();
  }

  @Sse('chat/stream')
  stream(@Query('sessionId') sessionId: string): Observable<MessageEvent> {
    if (!sessionId) throw new BadRequestException('sessionId is required');

    return new Observable((subscriber) => {
      const cleanup = this.openClawService.registerSession(sessionId, (data) =>
        subscriber.next({ data }),
      );

      this.logger.log(`[session] opened sessionId=${sessionId}`);

      return () => {
        cleanup();
        this.logger.log(`[session] closed sessionId=${sessionId}`);
      };
    });
  }

  @Get('chat/history')
  async getChatHistory(): Promise<{ messages: HistoryMessage[] }> {
    const messages = await this.openClawService.getHistory();
    return { messages };
  }

  @Post('chat')
  postChat(@Body() body: ChatRequestBody): { ok: boolean } {
    const dispatched = this.openClawService.sendMessageStream(
      body.message,
      body.sessionId,
    );

    if (!dispatched)
      throw new NotFoundException('Session not found — open the stream first');

    return { ok: true };
  }
}
