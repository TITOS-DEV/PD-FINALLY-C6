import { Injectable, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { Message, MessageDeletedPayload } from '../models/message.model';

/**
 * Thin abstraction wrapper over `socket.io-client`. Encapsulates connection lifecycle
 * and exposes methods (`connect()`, `joinChannel(id)`, `onNewMessage()`) to `ChatStore`.
 * Handshake authentication propagates the active access token matching backend behavior (socketServer.ts).
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly authService = inject(AuthService);
  private socket: Socket | null = null;

  connect(): void {
    if (this.socket?.connected) return;

    const token = this.authService.accessToken();
    if (!token) return;

    this.socket = io(environment.wsUrl, { auth: { token } });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Resolves boolean indicating successful channel room join (re-verified server-side via RLS). */
  joinChannel(channelId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve(false);
      this.socket.emit('join:channel', channelId, (joined: boolean) => resolve(joined));
    });
  }

  leaveChannel(channelId: string): void {
    this.socket?.emit('leave:channel', channelId);
  }

  /** Stream emitting incoming WebSocket messages across joined channels. */
  onNewMessage(): Observable<Message> {
    return this.on<Message>('message:new');
  }

  /** Stream emitting message update events containing updated content payloads. */
  onMessageUpdated(): Observable<Message> {
    return this.on<Message>('message:updated');
  }

  /** Stream emitting message soft-deletion events. */
  onMessageDeleted(): Observable<MessageDeletedPayload> {
    return this.on<MessageDeletedPayload>('message:deleted');
  }

  private on<T>(event: string): Observable<T> {
    return new Observable((subscriber) => {
      if (!this.socket) return;
      const handler = (payload: T) => subscriber.next(payload);
      this.socket.on(event, handler);
      return () => this.socket?.off(event, handler);
    });
  }
}
