import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ChatService } from './services/chat.service';
import { BuzzService } from './services/buzz.service';
import { FriendshipService } from './services/friendship.service';
import { LanguageService } from './services/language.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {

  isShaking = false;

  private globalBuzzChannel: any = null;
  private notifChannels: any[] = [];
  private notifId = 1;

  constructor(
    private chatService: ChatService,
    private buzzService: BuzzService,
    private friendshipService: FriendshipService,
    private lang: LanguageService,
    private toastCtrl: ToastController,
    private router: Router,
  ) {}

  async ngOnInit() {
    await this.initNotifications();

    const myId = await this.chatService.getCurrentUserId();
    if (myId) {
      this.setupGlobalBuzz(myId);
      this.setupNotifications(myId);
    }

    this.chatService.subscribeToAuthChanges((userId) => {
      if (userId && !this.globalBuzzChannel) {
        this.setupGlobalBuzz(userId);
        this.setupNotifications(userId);
      } else if (!userId) {
        if (this.globalBuzzChannel) {
          this.chatService.removeChannel(this.globalBuzzChannel);
          this.globalBuzzChannel = null;
        }
        this.cleanupNotifications();
      }
    });
  }

  private async initNotifications() {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.requestPermissions();
      await LocalNotifications.createChannel({
        id: 'messages',
        name: 'Messages',
        importance: 4,
        visibility: 1,
        vibration: true,
      });
      LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
        const extra = event.notification.extra;
        if (extra?.route && extra?.targetId) {
          this.router.navigate([extra.route], {
            queryParams: { id: extra.targetId, name: extra.targetName || '' },
          });
        }
      });
    } else if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  triggerGlobalShake() {
    this.isShaking = false;
    setTimeout(() => {
      this.isShaking = true;
      setTimeout(() => { this.isShaking = false; }, 640);
    }, 20);
  }

  private setupGlobalBuzz(myId: string) {
    this.globalBuzzChannel = this.chatService.subscribeToGlobalBuzz(
      myId,
      async (from: string, name: string) => {
        this.buzzService.play();
        this.buzzService.emit(from, name);
        this.triggerGlobalShake();

        const toast = await this.toastCtrl.create({
          message: `⚡ ${name || '?'} ${this.lang.t('buzz_toast')}`,
          duration: 3000,
          position: 'top',
          color: 'dark',
          icon: 'flash-outline',
          cssClass: 'buzz-global-toast',
        });
        await toast.present();
      }
    );
  }

  private async setupNotifications(myId: string) {
    const dmCh = this.chatService.subscribeToIncomingMessages(myId, async (msg: any) => {
      if (msg.sender_id === this.buzzService.activeChatContactId) return;
      const name = await this.chatService.getProfileDisplayName(msg.sender_id);
      const preview = msg.content || (msg.image_url ? '📷 Image' : '');
      this.showMsgNotification(name || '?', preview, false, msg.sender_id, name || '?');
    });
    this.notifChannels.push(dmCh);

    const groups = await this.friendshipService.getGroups();
    for (const group of groups) {
      const ch = this.chatService.subscribeToIncomingGroupMessages(group.id, async (msg: any) => {
        if (msg.sender_id === myId) return;
        if (group.id === this.buzzService.activeGroupId) return;
        const name = await this.chatService.getProfileDisplayName(msg.sender_id);
        const preview = msg.content || (msg.image_url ? '📷 Image' : '');
        this.showMsgNotification(group.name, `${name || '?'}: ${preview}`, true, group.id, group.name);
      });
      this.notifChannels.push(ch);
    }
  }

  private showMsgNotification(
    title: string,
    body: string,
    isGroup: boolean,
    targetId: string,
    targetName: string,
  ) {
    this.buzzService.playNotification();
    const route = isGroup ? '/group-chat' : '/chat';

    if (Capacitor.isNativePlatform()) {
      LocalNotifications.schedule({
        notifications: [{
          title,
          body,
          id: this.notifId++,
          channelId: 'messages',
          extra: { route, targetId, targetName },
        }],
      }).catch(() => {});
    } else {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const notif = new Notification(title, {
        body,
        icon: 'assets/icon/favicon.png',
        tag: targetId,
        renotify: true,
      } as NotificationOptions);
      notif.onclick = () => {
        window.focus();
        this.router.navigate([route], { queryParams: { id: targetId, name: targetName } });
        notif.close();
      };
    }
  }

  private cleanupNotifications() {
    for (const ch of this.notifChannels) {
      this.chatService.removeChannel(ch);
    }
    this.notifChannels = [];
  }
}
