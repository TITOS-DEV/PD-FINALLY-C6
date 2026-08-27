import { Injectable, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { Message, MessageDeletedPayload } from '../models/message.model';

/**
 * Wrapper delgado sobre socket.io-client. La idea es que el resto de la app
 * (el ChatStore) no importe `socket.io-client` directo ni maneje el ciclo
 * de vida de la conexión — solo llama `connect()`, `joinChannel(id)` y
 * escucha `onNewMessage()`.
 *
 * La autenticación acá espeja exactamente al backend (ver
 * socketServer.ts): el mismo access token que ya tenemos en AuthService, mandado en el handshake.
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

  /** Devuelve true/false según si el usuario de verdad es miembro del canal (el backend lo revalida con RLS). */
  joinChannel(channelId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve(false);
      this.socket.emit('join:channel', channelId, (joined: boolean) => resolve(joined));
    });
  }

  leaveChannel(channelId: string): void {
    this.socket?.emit('leave:channel', channelId);
  }

  /** Stream de mensajes nuevos que llegan por WebSocket, de cualquier canal al que nos hayamos unido. */
  onNewMessage(): Observable<Message> {
    return this.on<Message>('message:new');
  }

  /** Se dispara cuando alguien edita un mensaje — el payload es el mensaje completo, ya con el contenido nuevo. */
  onMessageUpdated(): Observable<Message> {
    return this.on<Message>('message:updated');
  }

  /** Se dispara cuando alguien borra (soft-delete) un mensaje. */
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
