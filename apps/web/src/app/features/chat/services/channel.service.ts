import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Channel } from '../../../core/models/channel.model';

/** HTTP wrapper service for `/api/channels`. */
@Injectable({ providedIn: 'root' })
export class ChannelService {
  private readonly http = inject(HttpClient);

  listMine(): Observable<{ channels: Channel[] }> {
    return this.http.get<{ channels: Channel[] }>(`${environment.apiUrl}/channels`);
  }

  create(input: { name: string; description?: string }): Observable<{ channel: Channel }> {
    return this.http.post<{ channel: Channel }>(`${environment.apiUrl}/channels`, input);
  }
}
