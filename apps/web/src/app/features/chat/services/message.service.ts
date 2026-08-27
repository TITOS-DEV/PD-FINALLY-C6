import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { GetChannelMessagesResponse, Message, MessageCursor } from '../../../core/models/message.model';

/** Wrapper HTTP fino sobre los endpoints de mensajes — el estado/la lógica viven en ChatStore. */
@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly http = inject(HttpClient);

  list(channelId: string, cursor?: MessageCursor, limit = 30): Observable<GetChannelMessagesResponse> {
    let params = new HttpParams().set('limit', limit);
    if (cursor) {
      params = params.set('cursorCreatedAt', cursor.createdAt).set('cursorId', cursor.id);
    }
    return this.http.get<GetChannelMessagesResponse>(
      `${environment.apiUrl}/channels/${channelId}/messages`,
      { params }
    );
  }

  send(channelId: string, content: string): Observable<{ message: Message }> {
    return this.http.post<{ message: Message }>(
      `${environment.apiUrl}/channels/${channelId}/messages`,
      { content }
    );
  }

  markAsRead(messageIds: string[]): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/messages/read-receipts`, { messageIds });
  }

  update(messageId: string, content: string): Observable<{ message: Message }> {
    return this.http.patch<{ message: Message }>(`${environment.apiUrl}/messages/${messageId}`, { content });
  }

  remove(messageId: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/messages/${messageId}`);
  }
}
