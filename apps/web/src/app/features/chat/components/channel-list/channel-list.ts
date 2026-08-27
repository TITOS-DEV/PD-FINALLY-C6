import { Component, OnInit, inject, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ChatStore } from '../../services/chat-store';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';

/**
 * User channels list component bound to ChatStore state.
 * Emits `channelSelected` event on click to close mobile navigation drawer.
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
