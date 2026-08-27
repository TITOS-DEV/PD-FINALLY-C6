import { Component, computed, inject, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { ChatStore } from '../../../chat/services/chat-store';
import { Avatar } from '../../../../shared/ui/avatar/avatar';

/**
 * Vista completa del perfil — la tarjeta chica del sidebar (`ProfileCard`)
 * ya cumple con lo mínimo que pide el enunciado (nombre, email, rol del
 * JWT), pero acá se abre en grande cuando alguien quiere ver su cuenta con
 * calma: mismo dato, con más espacio y un poco más de contexto (desde
 * cuándo es miembro, en cuántos canales está).
 *
 * No hay nada que editar acá — el backend no tiene un endpoint para
 * cambiar nombre/email/rol, así que esto es intencionalmente de solo
 * lectura en vez de simular una edición que no llega a ningún lado.
 */
@Component({
  selector: 'app-profile-modal',
  imports: [TranslatePipe, DatePipe, Avatar],
  templateUrl: './profile-modal.html',
  styleUrl: './profile-modal.css',
})
export class ProfileModal {
  private readonly authService = inject(AuthService);
  private readonly chatStore = inject(ChatStore);

  readonly closed = output<void>();

  protected readonly user = computed(() => this.authService.currentUser());
  protected readonly channelCount = computed(() => this.chatStore.channels().length);
}
