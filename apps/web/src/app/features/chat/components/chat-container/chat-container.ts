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

/** A qué distancia del tope (en píxeles) empezamos a pedir la página anterior. */
const LOAD_MORE_THRESHOLD_PX = 80;
/** Dos mensajes seguidos del mismo autor separados por más de esto ya no se agrupan visualmente. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Un mensaje más el dato de si le toca mostrar el encabezado (avatar + nombre + hora) o no. */
interface MessageRow {
  message: Message;
  showHeader: boolean;
}

/**
 * Zona central de mensajería: header del canal, historial con scroll y el
 * composer abajo. Es el componente más "con estado visual" de toda la app
 * porque tiene que cubrir las 4 situaciones que pide el enunciado:
 * cargando (skeleton), vacío, error de conexión, y la lista normal con
 * cada mensaje mostrando su estado (pending/sent/failed).
 *
 * El estilo visual es tipo Slack/Discord: sin burbujas, sin alinear los
 * mensajes propios a la derecha — todos los mensajes se ven igual de
 * "protagonistas" en una lista plana, y los mensajes seguidos de la misma
 * persona se agrupan bajo un solo encabezado (avatar + nombre + hora) en
 * vez de repetirlo en cada línea, que es justo lo que hace que esos chats
 * se sientan menos "saturados" que el estilo de burbujas.
 *
 * No tiene NINGÚN estado propio de datos — todo (mensajes, loading,
 * errores, si hay más historial) sale de `ChatStore`. Lo único que este
 * componente posee es el manejo del scroll y el agrupado visual, porque
 * son detalles de presentación, no de datos.
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

  // ---- Edición en línea ----
  protected readonly editingMessageId = signal<string | null>(null);
  protected readonly editingDraft = signal('');

  // ---- Confirmación antes de borrar (nada de un `confirm()` nativo del navegador) ----
  protected readonly confirmingDeleteId = signal<string | null>(null);

  /**
   * Convierte el array plano de ChatStore en filas con `showHeader`
   * calculado: arranca un grupo nuevo cuando cambia el autor, cuando pasan
   * más de 5 minutos entre un mensaje y el siguiente, o cuando alguno de
   * los dos no está en estado 'sent' — un mensaje pendiente o fallido
   * siempre muestra su propio encabezado, para que el estado de "no se
   * pudo enviar" con su botón de reintentar nunca quede escondido dentro
   * de un grupo ajeno.
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

  /**
   * Si la persona está mirando el final de la conversación, un mensaje
   * nuevo (propio o de otro) debe empujar la vista hacia abajo sola, como
   * en cualquier chat. Pero si se fue para arriba a leer historial viejo,
   * lo último que queremos es "secuestrarle" el scroll de vuelta al fondo
   * cada vez que llega un mensaje — por eso el auto-scroll solo se activa
   * cuando ya estaba cerca del fondo.
   */
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
   * Acá está la estrategia completa para no perder la posición del scroll
   * al cargar mensajes más viejos (esto es justo lo que pide el enunciado
   * y lo que documento en DECISIONS.md):
   *
   *   1. Antes de pedir la página vieja, medimos `scrollHeight` y
   *      `scrollTop` actuales del contenedor.
   *   2. Le pedimos a ChatStore la página anterior. Como los mensajes
   *      nuevos se INSERTAN AL PRINCIPIO del array, el navegador va a
   *      agrandar el contenido por ARRIBA — sin corregir nada, eso hace
   *      que la vista "salte" y la persona pierda el mensaje que estaba
   *      leyendo.
   *   3. Angular todavía no terminó de pintar el DOM con los mensajes
   *      nuevos en el momento en que `loadMoreMessages()` resuelve (el
   *      signal ya cambió, pero el navegador recién va a hacer el reflow
   *      en el próximo ciclo de render). Por eso usamos `afterNextRender`:
   *      es la forma correcta en Angular moderno de decir "ejecutá esto
   *      recién cuando el DOM ya se actualizó de verdad".
   *   4. Con el DOM ya actualizado, medimos cuánto CRECIÓ el contenido
   *      (`nuevo scrollHeight - viejo scrollHeight`) y le sumamos esa
   *      diferencia al `scrollTop` que teníamos guardado. El resultado:
   *      la persona sigue viendo exactamente el mismo mensaje en la misma
   *      posición de la pantalla, como si nada hubiera cambiado arriba.
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

  /** El composer siempre está visible aunque la lista esté scrolleada hacia
   *  arriba — si la persona manda un mensaje desde ahí, igual queremos que
   *  la vista baje a mostrárselo. */
  protected onOwnMessageSent(): void {
    this.isNearBottom = true;
  }

  // ---- Permisos: mismo criterio que ya valida el backend (EditMessage/DeleteMessage) ----
  protected canEdit(message: Message): boolean {
    return message.userId === this.authService.currentUser()?.id;
  }

  protected canDelete(message: Message): boolean {
    const user = this.authService.currentUser();
    return message.userId === user?.id || user?.role === 'admin';
  }

  /** `updatedAt` solo se mueve del valor de `createdAt` cuando el mensaje pasó por un PATCH. */
  protected isEdited(message: Message): boolean {
    return message.updatedAt !== message.createdAt;
  }

  // ---- Edición en línea ----
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

  // ---- Confirmar antes de borrar ----
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
