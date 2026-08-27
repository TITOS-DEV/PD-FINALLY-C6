import { AfterViewChecked, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ChatStore } from '../../services/chat-store';
import { AuthService } from '../../../../core/auth/auth.service';
import { MessageSkeleton } from '../../../../shared/ui/skeleton/message-skeleton';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { MessageComposer } from '../message-composer/message-composer';
import { Avatar } from '../../../../shared/ui/avatar/avatar';
import { Message } from '../../../../core/models/message.model';

/** Threshold in pixels from top of scroll container to trigger loading previous page. */
const LOAD_MORE_THRESHOLD_PX = 80;
/** Maximum duration threshold in milliseconds between consecutive messages by same author to group headers. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Message row view model with calculated header visibility boolean flag. */
interface MessageRow {
  message: Message;
  showHeader: boolean;
}

/**
 * Main chat container component: renders active channel header, scrollable message history,
 * and bottom message composer. Manages scroll preservation and visual grouping logic.
 */
@Component({
  selector: 'app-chat-container',
  imports: [TranslatePipe, DatePipe, FormsModule, MessageSkeleton, EmptyState, MessageComposer, Avatar],
  templateUrl: './chat-container.html',
  styleUrl: './chat-container.css',
})
export class ChatContainer implements AfterViewChecked {
  protected readonly chatStore = inject(ChatStore);
  private readonly authService = inject(AuthService);
  private readonly injector = inject(Injector);

  private readonly scrollContainerRef = viewChild.required<ElementRef<HTMLDivElement>>('scrollContainer');

  // Inline editing state
  protected readonly editingMessageId = signal<string | null>(null);
  protected readonly editingDraft = signal('');

  // Deletion confirmation state
  protected readonly confirmingDeleteId = signal<string | null>(null);

  /**
   * Computes formatted message rows with header visibility rules:
   * A new header is created when the author changes, when > 5 minutes elapse,
   * or when either message status is not 'sent'.
   */
  protected readonly rows = computed<MessageRow[]>(() => {
    const messages = this.chatStore.messages();
    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const sameAuthor = previous?.userId === message.userId;
      const withinWindow =
        !!previous && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < GROUP_WINDOW_MS;
      const bothSent = previous?.status === 'sent' && message.status === 'sent';

      return { message, showHeader: !(sameAuthor && withinWindow && bothSent) };
    });
  });

  private isNearBottom = true;

  ngAfterViewChecked(): void {
    if (this.isNearBottom) {
      const el = this.scrollContainerRef().nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  protected onScroll(): void {
    const el = this.scrollContainerRef().nativeElement;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.isNearBottom = distanceFromBottom < 120;

    const isNearTop = el.scrollTop < LOAD_MORE_THRESHOLD_PX;
    if (isNearTop && this.chatStore.hasMoreMessages() && !this.chatStore.loadingMore()) {
      this.loadOlderMessages();
    }
  }

  /**
   * Scroll preservation strategy when loading historical message pages:
   * 1. Captures pre-fetch `scrollHeight` and `scrollTop`.
   * 2. Triggers `chatStore.loadMoreMessages()` to prepend historical items.
   * 3. Uses `afterNextRender` to wait for DOM updates post-render.
   * 4. Adjusts `scrollTop` by height delta (`newScrollHeight - previousScrollHeight`).
   */
  private async loadOlderMessages(): Promise<void> {
    const el = this.scrollContainerRef().nativeElement;
    const previousScrollHeight = el.scrollHeight;
    const previousScrollTop = el.scrollTop;

    await this.chatStore.loadMoreMessages();

    afterNextRender(
      () => {
        const newScrollHeight = el.scrollHeight;
        el.scrollTop = previousScrollTop + (newScrollHeight - previousScrollHeight);
      },
      { injector: this.injector }
    );
  }

  protected trackByMessageId(_index: number, row: MessageRow): string {
    return row.message.id;
  }

  protected retry(messageId: string): void {
    this.chatStore.retryMessage(messageId);
    this.isNearBottom = true;
  }

  protected onOwnMessageSent(): void {
    this.isNearBottom = true;
  }

  protected canEdit(message: Message): boolean {
    return message.userId === this.authService.currentUser()?.id;
  }

  protected canDelete(message: Message): boolean {
    const user = this.authService.currentUser();
    return message.userId === user?.id || user?.role === 'admin';
  }

  protected isEdited(message: Message): boolean {
    return message.updatedAt !== message.createdAt;
  }

  protected startEdit(message: Message): void {
    this.confirmingDeleteId.set(null);
    this.editingMessageId.set(message.id);
    this.editingDraft.set(message.content);
  }

  protected cancelEdit(): void {
    this.editingMessageId.set(null);
    this.editingDraft.set('');
  }

  protected saveEdit(messageId: string): void {
    const content = this.editingDraft().trim();
    if (content.length === 0) return;
    this.chatStore.editMessage(messageId, content);
    this.cancelEdit();
  }

  protected onEditKeydown(event: KeyboardEvent, messageId: string): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.saveEdit(messageId);
    } else if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }

  protected requestDelete(messageId: string): void {
    this.editingMessageId.set(null);
    this.confirmingDeleteId.set(messageId);
  }

  protected cancelDeleteConfirm(): void {
    this.confirmingDeleteId.set(null);
  }

  protected confirmDelete(messageId: string): void {
    this.chatStore.deleteMessage(messageId);
    this.confirmingDeleteId.set(null);
  }
}
