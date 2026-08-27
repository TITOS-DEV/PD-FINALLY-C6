import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, of, tap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { SocketService } from '../../../core/realtime/socket.service';
import { Channel } from '../../../core/models/channel.model';
import { Message, MessageCursor, MessageDeletedPayload } from '../../../core/models/message.model';
import { ChannelService } from './channel.service';
import { MessageService } from './message.service';
import { ToastService } from '../../../shared/ui/toast/toast.service';

/**
 * Messaging state store managing active channel selection, optimistic message updates,
 * WebSocket event subscriptions, and keyset pagination state.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly channelService = inject(ChannelService);
  private readonly messageService = inject(MessageService);
  private readonly socketService = inject(SocketService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  private readonly PAGE_SIZE = 30;

  // Channels state
  readonly channels = signal<Channel[]>([]);
  readonly channelsLoading = signal(false);
  readonly channelsError = signal(false);

  // Selected channel & messages state
  readonly selectedChannelId = signal<string | null>(null);
  readonly selectedChannel = computed(
    () => this.channels().find((c) => c.id === this.selectedChannelId()) ?? null
  );
  readonly messages = signal<Message[]>([]);
  readonly messagesLoading = signal(false); // Initial load for selected channel
  readonly loadingMore = signal(false); // Pagination loading (scroll up)
  readonly messagesError = signal(false);
  private readonly nextCursor = signal<MessageCursor | null>(null);
  readonly hasMoreMessages = computed(() => this.nextCursor() !== null);

  constructor() {
    // Subscribe once to global real-time message event streams
    this.socketService.onNewMessage().subscribe((incoming) => this.handleIncomingMessage(incoming));
    this.socketService.onMessageUpdated().subscribe((updated) => this.handleIncomingUpdate(updated));
    this.socketService.onMessageDeleted().subscribe((payload) => this.handleIncomingDelete(payload));
  }

  loadChannels(): void {
    this.channelsLoading.set(true);
    this.channelsError.set(false);

    this.channelService
      .listMine()
      .pipe(
        tap({
          next: (res) => this.channels.set(res.channels),
          error: () => this.channelsError.set(true),
        }),
        catchError(() => of(null))
      )
      .subscribe(() => this.channelsLoading.set(false));
  }

  async selectChannel(channelId: string): Promise<void> {
    if (this.selectedChannelId() === channelId) return;

    const previous = this.selectedChannelId();
    if (previous) this.socketService.leaveChannel(previous);

    this.selectedChannelId.set(channelId);
    this.messages.set([]);
    this.nextCursor.set(null);
    this.messagesError.set(false);

    await this.socketService.joinChannel(channelId);
    this.loadInitialMessages(channelId);
  }

  private loadInitialMessages(channelId: string): void {
    this.messagesLoading.set(true);

    this.messageService.list(channelId, undefined, this.PAGE_SIZE).subscribe({
      next: (res) => {
        // Backend orders newest first (DESC); reverse for chronological UI ordering
        this.messages.set([...res.messages].reverse());
        this.nextCursor.set(res.nextCursor);
        this.messagesLoading.set(false);
        this.markLoadedMessagesAsRead();
      },
      error: () => {
        this.messagesLoading.set(false);
        this.messagesError.set(true);
      },
    });
  }

  /**
   * Fetches historical messages (older page) and prepends them to state.
   * Returns a promise resolving when state updates, allowing `ChatContainerComponent`
   * to recalculate scroll position.
   */
  loadMoreMessages(): Promise<void> {
    const channelId = this.selectedChannelId();
    const cursor = this.nextCursor();
    if (!channelId || !cursor || this.loadingMore()) return Promise.resolve();

    this.loadingMore.set(true);

    return new Promise((resolve) => {
      this.messageService.list(channelId, cursor, this.PAGE_SIZE).subscribe({
        next: (res) => {
          this.messages.update((current) => [...[...res.messages].reverse(), ...current]);
          this.nextCursor.set(res.nextCursor);
          this.loadingMore.set(false);
          resolve();
        },
        error: () => {
          this.loadingMore.set(false);
          this.toastService.error('chat.errors.loadMoreFailed');
          resolve();
        },
      });
    });
  }

  /**
   * Optimistic sending: renders message instantly with 'pending' status,
   * updating to 'sent' or 'failed' upon backend API response.
   */
  sendMessage(content: string): void {
    const channelId = this.selectedChannelId();
    const user = this.authService.currentUser();
    if (!channelId || !user) return;

    const tempId = crypto.randomUUID();
    const optimisticMessage: Message = {
      id: tempId,
      channelId,
      userId: user.id,
      authorName: user.name,
      content,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    this.messages.update((current) => [...current, optimisticMessage]);

    this.messageService.send(channelId, content).subscribe({
      next: (res) => this.replaceMessage(tempId, res.message),
      error: () => {
        this.updateMessageStatus(tempId, 'failed');
        this.toastService.error('chat.errors.sendFailed');
      },
    });
  }

  retryMessage(failedMessageId: string): void {
    const failed = this.messages().find((m) => m.id === failedMessageId);
    if (!failed) return;
    this.messages.update((current) => current.filter((m) => m.id !== failedMessageId));
    this.sendMessage(failed.content);
  }

  editMessage(messageId: string, content: string): void {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;

    this.messageService.update(messageId, trimmed).subscribe({
      next: (res) => this.replaceMessage(messageId, res.message),
      error: () => this.toastService.error('chat.errors.editFailed'),
    });
  }

  deleteMessage(messageId: string): void {
    this.messageService.remove(messageId).subscribe({
      next: () => this.removeMessage(messageId),
      error: () => this.toastService.error('chat.errors.deleteFailed'),
    });
  }

  private handleIncomingMessage(incoming: Message): void {
    // Ignore echo of own sent messages to prevent duplication
    if (incoming.userId === this.authService.currentUser()?.id) return;
    if (incoming.channelId !== this.selectedChannelId()) return;
    if (this.messages().some((m) => m.id === incoming.id)) return;

    this.messages.update((current) => [...current, incoming]);
  }

  private handleIncomingUpdate(updated: Message): void {
    if (updated.channelId !== this.selectedChannelId()) return;
    this.replaceMessage(updated.id, updated);
  }

  private handleIncomingDelete(payload: MessageDeletedPayload): void {
    if (payload.channelId !== this.selectedChannelId()) return;
    this.removeMessage(payload.id);
  }

  private replaceMessage(id: string, real: Message): void {
    this.messages.update((current) => current.map((m) => (m.id === id ? real : m)));
  }

  private removeMessage(id: string): void {
    this.messages.update((current) => current.filter((m) => m.id !== id));
  }

  private updateMessageStatus(id: string, status: Message['status']): void {
    this.messages.update((current) => current.map((m) => (m.id === id ? { ...m, status } : m)));
  }

  private markLoadedMessagesAsRead(): void {
    const ids = this.messages().map((m) => m.id);
    if (ids.length === 0) return;
    this.messageService.markAsRead(ids).subscribe({ error: () => {} });
  }
}
