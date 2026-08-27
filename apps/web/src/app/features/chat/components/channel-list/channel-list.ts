import { Component, OnInit, inject, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ChatStore } from '../../services/chat-store';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';

/**
 * Listado de canales del usuario, en base a la vista de conversaciones.
 * No guarda estado propio — todo sale de ChatStore, este componente solo
 * lo pinta y avisa (`channelSelected`) cuando alguien hace clic, para que
 * el shell que lo contiene pueda cerrar el drawer en mobile.
 */
@Component({
  selector: 'app-channel-list',
  imports: [TranslatePipe, EmptyState],
  templateUrl: './channel-list.html',
  styleUrl: './channel-list.css',
})
export class ChannelList implements OnInit {
  protected readonly chatStore = inject(ChatStore);
  readonly channelSelected = output<void>();

  ngOnInit(): void {
    this.chatStore.loadChannels();
  }

  protected onSelect(channelId: string): void {
    this.chatStore.selectChannel(channelId);
    this.channelSelected.emit();
  }
}
