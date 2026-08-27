import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { I18nService, AppLang } from '../../../../core/i18n/i18n.service';
import { SocketService } from '../../../../core/realtime/socket.service';
import { Avatar } from '../../../../shared/ui/avatar/avatar';
import { ProfileModal } from '../profile-modal/profile-modal';

/**
 * Sidebar authenticated user card component — displays user name, email, and role
 * extracted from JWT claims (`sub`, `role`) and user profile data (`rw_users`).
 * Houses language selector control and session logout action.
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
