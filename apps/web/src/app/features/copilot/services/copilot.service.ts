import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AskCopilotResponse } from '../../../core/models/copilot.model';

/** HTTP wrapper service for `/api/copilot/ask`. Conversation state is managed by `CopilotPanel`. */
@Injectable({ providedIn: 'root' })
export class CopilotService {
  private readonly http = inject(HttpClient);

  ask(question: string): Observable<AskCopilotResponse> {
    return this.http.post<AskCopilotResponse>(`${environment.apiUrl}/copilot/ask`, { question });
  }
}
