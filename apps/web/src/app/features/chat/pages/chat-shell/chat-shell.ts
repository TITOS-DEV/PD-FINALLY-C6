import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { SocketService } from '../../../../core/realtime/socket.service';
import { ChannelList } from '../../components/channel-list/channel-list';
import { ChatContainer } from '../../components/chat-container/chat-container';
import { CopilotPanel } from '../../../copilot/components/copilot-panel/copilot-panel';
import { ProfileCard } from '../../../profile/components/profile-card/profile-card';

/**
 * Root authenticated layout shell component: structures 3 core layout zones
 * (channels list + profile, main chat view, copilot assistant panel) within a responsive grid.
 * Manages mobile drawer toggles and WebSocket connection lifecycle.
 */
@Component({
  selector: 'app-chat-shell',
  imports: [ChannelList, ChatContainer, CopilotPanel, ProfileCard],
  templateUrl: './chat-shell.html',
  styleUrl: './chat-shell.css',
})
export class ChatShell implements OnInit, OnDestroy {
  private readonly socketService = inject(SocketService);

  protected readonly sidebarOpen = signal(false);
  protected readonly copilotOpen = signal(false);

  ngOnInit(): void {
    this.socketService.connect();
  }

  ngOnDestroy(): void {
    this.socketService.disconnect();
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  protected toggleCopilot(): void {
    this.copilotOpen.update((open) => !open);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected closeCopilot(): void {
    this.copilotOpen.set(false);
  }
}
