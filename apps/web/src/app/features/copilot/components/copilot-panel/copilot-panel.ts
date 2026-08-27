import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CopilotService } from '../../services/copilot.service';
import { CopilotTurn } from '../../../../core/models/copilot.model';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';

const MIN_SOURCES_TO_TRUST = 1;

/**
 * Panel lateral del copiloto de IA. Cada pregunta que se manda queda como
 * un "turno" (`CopilotTurn`) con su propio estado (pending/answered/failed)
 * — igual que hacemos con los mensajes del chat, para que la persona vea
 * de inmediato que su pregunta se está procesando en vez de quedarse
 * mirando una pantalla congelada.
 *
 * La parte más importante de este componente, la que pide explícitamente
 * el enunciado, es CÓMO se muestra una respuesta:
 *
 *   - Si `sources.length > 0`, la respuesta viene acompañada de la lista
 *     de mensajes reales que el backend usó para armarla (ver
 *     AskCopilot.ts del lado del backend) — cada fuente muestra de qué
 *     canal salió, quién la escribió y qué tan parecida es a la pregunta
 *     (`similarity`). Eso es lo que hace que la respuesta se sienta
 *     confiable: no es una caja negra, se puede ir a verificar de dónde salió.
 *
 *   - Si `sources.length === 0`, el backend igual devuelve un texto (el
 *     system prompt de AskCopilot ya le pide a la IA admitir que no sabe),
 *     pero acá lo remarcamos con un aviso visual aparte en vez de confiar
 *     solo en que el texto lo diga con las palabras justas — así, si el
 *     usuario le pregunta algo de un canal al que no pertenece (o algo que
 *     nadie escribió), queda clarísimo que la respuesta no está anclada en
 *     ningún mensaje real de sus canales, y no una alucinación con estilo de
 *     respuesta segura.
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
