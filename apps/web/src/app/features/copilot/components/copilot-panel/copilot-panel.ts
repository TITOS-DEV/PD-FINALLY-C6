import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CopilotService } from '../../services/copilot.service';
import { CopilotTurn } from '../../../../core/models/copilot.model';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';

const MIN_SOURCES_TO_TRUST = 1;

/**
 * AI Copilot side panel component. Each user query creates a conversation turn
 * (`CopilotTurn`) tracking state (pending/answered/failed) for responsive user feedback.
 *
 * Response rendering logic:
 *   - If `sources.length > 0`: standard response accompanied by grounding sources list
 *     (channel name, author name, similarity score).
 *   - If `sources.length === 0`: response accompanied by visual alert indicating
 *     that no message sources grounded the generated answer.
 */
@Component({
  selector: 'app-copilot-panel',
  imports: [FormsModule, TranslatePipe, DecimalPipe, EmptyState],
  templateUrl: './copilot-panel.html',
  styleUrl: './copilot-panel.css',
})
export class CopilotPanel {
  private readonly copilotService = inject(CopilotService);

  protected readonly question = signal('');
  protected readonly turns = signal<CopilotTurn[]>([]);
  protected readonly isAsking = computed(() => this.turns().some((turn) => turn.status === 'pending'));
  protected readonly minSourcesToTrust = MIN_SOURCES_TO_TRUST;

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.ask();
    }
  }

  protected ask(): void {
    const trimmed = this.question().trim();
    if (trimmed.length === 0 || this.isAsking()) return;

    const turn: CopilotTurn = {
      id: crypto.randomUUID(),
      question: trimmed,
      answer: null,
      sources: [],
      status: 'pending',
    };

    this.turns.update((list) => [...list, turn]);
    this.question.set('');

    this.copilotService.ask(trimmed).subscribe({
      next: (res) => this.updateTurn(turn.id, { answer: res.answer, sources: res.sources, status: 'answered' }),
      error: () => this.updateTurn(turn.id, { status: 'failed' }),
    });
  }

  protected retry(turnId: string): void {
    const turn = this.turns().find((t) => t.id === turnId);
    if (!turn) return;
    this.turns.update((list) => list.filter((t) => t.id !== turnId));
    this.question.set(turn.question);
    this.ask();
  }

  private updateTurn(id: string, changes: Partial<CopilotTurn>): void {
    this.turns.update((list) => list.map((turn) => (turn.id === id ? { ...turn, ...changes } : turn)));
  }
}
