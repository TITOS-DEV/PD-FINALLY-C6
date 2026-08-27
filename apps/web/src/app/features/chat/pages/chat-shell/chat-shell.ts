import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { SocketService } from '../../../../core/realtime/socket.service';
import { ChannelList } from '../../components/channel-list/channel-list';
import { ChatContainer } from '../../components/chat-container/chat-container';
import { CopilotPanel } from '../../../copilot/components/copilot-panel/copilot-panel';
import { ProfileCard } from '../../../profile/components/profile-card/profile-card';

/**
 * Layout raíz de la app autenticada: arma las 3 zonas del enunciado
 * (canales + perfil, chat, copiloto) en un grid responsivo. En pantallas
 * grandes las tres columnas se ven a la vez; en mobile, canales y copiloto
 * se convierten en drawers que se abren por encima del chat, para no
 * competir por espacio en una pantalla chica.
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
