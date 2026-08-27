import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ChatStore } from '../../services/chat-store';

const MAX_LENGTH = 4000; // matching backend validation schema (sendMessageSchema)

/**
 * Message input composer component.
 * Enter sends message, Shift+Enter inserts newline.
 */
@Component({
  selector: 'app-message-composer',
  imports: [FormsModule, TranslatePipe],
  templateUrl: './message-composer.html',
  styleUrl: './message-composer.css',
})
export class MessageComposer {
  private readonly chatStore = inject(ChatStore);

  protected readonly content = signal('');
  protected readonly maxLength = MAX_LENGTH;
  /** Emits event when message is sent to trigger auto-scroll to bottom. */
  readonly sent = output<void>();

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  protected send(): void {
    const trimmed = this.content().trim();
    if (trimmed.length === 0) return;

    this.chatStore.sendMessage(trimmed);
    this.content.set('');
    this.sent.emit();
  }
}
