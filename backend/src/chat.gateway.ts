import { Logger } from '@nestjs/common';
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { OpenClawService } from './openclaw.service';

interface IncomingMessage {
  message: string;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly openClaw: OpenClawService) {}

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: IncomingMessage,
  ): Promise<void> {
    this.logger.log(`Received message from ${client.id}`);

    const response = await this.openClaw.sendMessage(data.message);
    client.emit('response', { response });
  }
}
