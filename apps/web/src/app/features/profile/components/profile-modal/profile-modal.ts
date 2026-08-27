import { Component, computed, inject, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { ChatStore } from '../../../chat/services/chat-store';
import { Avatar } from '../../../../shared/ui/avatar/avatar';

/**
 * Detailed profile modal view — expands sidebar user card into an overlay
 * displaying full account context (membership creation timestamp, channel memberships).
 * Read-only interface corresponding to backend schema scope.
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
