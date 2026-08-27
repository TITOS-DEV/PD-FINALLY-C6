import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { I18nService, AppLang } from '../../../../core/i18n/i18n.service';
import { SocketService } from '../../../../core/realtime/socket.service';
import { Avatar } from '../../../../shared/ui/avatar/avatar';
import { ProfileModal } from '../profile-modal/profile-modal';

/**
 * Tarjeta con los datos del usuario autenticado — nombre, email y rol,
 * todo sacado del objeto `user` que devolvió el login (que a su vez viene
 * de lo que codifica el JWT del backend: `sub` y `role`, más el resto del
 * perfil desde `rw_users`). También vive acá el selector de idioma y el logout,
 * por ser la zona más lógica de "configuración de la cuenta".
 */
@Component({
  selector: 'app-profile-card',
  imports: [TranslatePipe, Avatar, ProfileModal],
  templateUrl: './profile-card.html',
  styleUrl: './profile-card.css',
})
export class ProfileCard {
  protected readonly authService = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly socketService = inject(SocketService);
  private readonly router = inject(Router);

  protected readonly showProfileModal = signal(false);

  protected setLanguage(lang: AppLang): void {
    this.i18n.setLanguage(lang);
  }

  protected logout(): void {
    this.socketService.disconnect();
    this.authService.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
