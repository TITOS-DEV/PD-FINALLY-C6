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
 * Estado de la zona de mensajería, centralizado acá para que
 * ChatContainerComponent (y cualquier otro componente que lo necesite, como
 * el listado de canales) sea "tonto": solo lee signals y llama métodos, sin
 * guardar su propia copia del estado.
 *
 * Solo mantenemos en memoria los mensajes del canal ACTUALMENTE
 * seleccionado — no un mapa con todos los canales a la vez. Es la
 * simplificación correcta acá: la UI nunca muestra dos canales al mismo
 * tiempo, así que no hay razón para pagar la complejidad de sincronizar
 * estado de varios canales en paralelo.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly channelService = inject(ChannelService);
  private readonly messageService = inject(MessageService);
  private readonly socketService = inject(SocketService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  private readonly PAGE_SIZE = 30;

  // ---- Canales ----
  readonly channels = signal<Channel[]>([]);
  readonly channelsLoading = signal(false);
  readonly channelsError = signal(false);

  // ---- Canal seleccionado + sus mensajes ----
  readonly selectedChannelId = signal<string | null>(null);
  readonly selectedChannel = computed(
    () => this.channels().find((c) => c.id === this.selectedChannelId()) ?? null
  );
  readonly messages = signal<Message[]>([]);
  readonly messagesLoading = signal(false); // carga inicial del canal
  readonly loadingMore = signal(false); // cargando una página más vieja (scroll hacia arriba)
  readonly messagesError = signal(false);
  private readonly nextCursor = signal<MessageCursor | null>(null);
  readonly hasMoreMessages = computed(() => this.nextCursor() !== null);

  constructor() {
    // Nos suscribimos UNA sola vez, para toda la vida de la app, a los
    // mensajes que llegan por WebSocket — sin importar a qué canal estemos
    // mirando en un momento dado.
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
        // El backend manda lo más nuevo primero (DESC); para un chat normal
        // (lo viejo arriba, lo nuevo abajo) necesitamos el orden invertido.
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
   * Trae la página anterior (mensajes más viejos) y la pega ADELANTE del
   * array actual. Devuelve una promesa que se resuelve cuando el array ya
   * se actualizó, porque ChatContainerComponent necesita ese momento exacto
   * para corregir la posición del scroll (ver ese componente para el
   * porqué) — más allá de eso, quien preserva el scroll es el componente,
   * este método solo se encarga de los datos.
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
   * Envío optimista: el mensaje aparece en pantalla como 'pending' de
   * inmediato, y se actualiza a 'sent' o 'failed' según lo que responda el
   * backend — la persona nunca se queda mirando una pantalla congelada
   * esperando la red.
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

  /** Reintenta un mensaje que quedó en 'failed' — lo saca de la lista y lo vuelve a mandar como uno nuevo. */
  retryMessage(failedMessageId: string): void {
    const failed = this.messages().find((m) => m.id === failedMessageId);
    if (!failed) return;
    this.messages.update((current) => current.filter((m) => m.id !== failedMessageId));
    this.sendMessage(failed.content);
  }

  /**
   * Edición no-optimista a propósito: a diferencia de enviar un mensaje
   * (que hacemos sentir instantáneo porque pasa todo el tiempo), editar es
   * poco frecuente — esperar la confirmación del backend antes de mostrar
   * el cambio evita tener que lidiar con "revertir" el contenido si la
   * edición falla.
   */
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
    // Los mensajes que mandamos NOSOTROS ya se agregan de forma optimista y
    // se confirman con la respuesta del POST — si además los agregáramos
    // acá cuando el WebSocket los rebota, terminaríamos mostrándolos dos
    // veces. Por eso ignoramos el eco de nuestros propios mensajes.
    if (incoming.userId === this.authService.currentUser()?.id) return;
    if (incoming.channelId !== this.selectedChannelId()) return;
    if (this.messages().some((m) => m.id === incoming.id)) return;

    this.messages.update((current) => [...current, incoming]);
  }

  /**
   * Alguien más editó un mensaje que tenemos en pantalla — no filtramos el
   * "eco" propio como sí hacemos con los mensajes nuevos: acá no hay riesgo
   * de duplicar nada, en el peor caso nos actualizamos a nosotros mismos
   * con el mismo dato que ya teníamos.
   */
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
    this.messageService.markAsRead(ids).subscribe({ error: () => {} }); // best-effort, no bloquea la UI
  }
}
