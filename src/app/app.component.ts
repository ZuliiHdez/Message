import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ChatService } from './services/chat.service';
import { BuzzService } from './services/buzz.service';
import { FriendshipService } from './services/friendship.service';
import { LanguageService } from './services/language.service';
import { SupabaseService } from './services/supabase.service';
import { ThemeService } from './services/theme.service';

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

  private awayTimer: any = null;
  private offlineTimer: any = null;
  private heartbeatInterval: any = null;
  private readonly AWAY_DELAY_MS    = 30_000;      // 30 s en segundo plano → ausente
  private readonly OFFLINE_DELAY_MS = 5 * 60_000;  // 5 min ausente → desconectado
  private readonly HEARTBEAT_MS     = 60_000;      // latido cada 60 s en primer plano

  constructor(
    private chatService: ChatService,
    private buzzService: BuzzService,
    private friendshipService: FriendshipService,
    private lang: LanguageService,
    private toastCtrl: ToastController,
    private router: Router,
    private supabase: SupabaseService,
    themeService: ThemeService,  // injected here so it initializes early
  ) {}

  async ngOnInit() {
    await this.initNotifications();

    const myId = await this.chatService.getCurrentUserId();
    if (myId) {
      this.setupGlobalBuzz(myId);
      this.setupNotifications(myId);
      this.startHeartbeat();
    }

    this.chatService.subscribeToAuthChanges((userId) => {
      if (userId && !this.globalBuzzChannel) {
        this.setupGlobalBuzz(userId);
        this.setupNotifications(userId);
        this.startHeartbeat();
      } else if (!userId) {
        if (this.globalBuzzChannel) {
          this.chatService.removeChannel(this.globalBuzzChannel);
          this.globalBuzzChannel = null;
        }
        this.cleanupNotifications();
        this.stopHeartbeat();
      }
    });

    if (Capacitor.isNativePlatform()) {
      this.setupDeepLinks();
      this.setupAppStateListener();
    }
  }

  private setupDeepLinks() {
    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.includes('reset-password')) return;

      // Supabase añade los tokens en el fragmento hash: #access_token=...&refresh_token=...
      const hash = url.includes('#') ? url.split('#')[1] : '';
      const params = new URLSearchParams(hash);
      const accessToken  = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        await this.supabase.getClient().auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }

      this.router.navigate(['/reset-password']);
    });
  }

  private setupAppStateListener() {
    App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) {
        // App pasa a segundo plano: detener heartbeat para que last_seen deje de actualizarse
        this.stopHeartbeat();

        const currentStatus = (localStorage.getItem('lastUserAvailability') || 'online') as string;

        this.awayTimer = setTimeout(async () => {
          if (currentStatus !== 'busy') {
            await this.chatService.setUserStatus('away');
            this.offlineTimer = setTimeout(async () => {
              await this.chatService.setUserStatus('offline');
            }, this.OFFLINE_DELAY_MS);
          }
        }, this.AWAY_DELAY_MS);

      } else {
        // App vuelve al primer plano
        if (this.awayTimer)    { clearTimeout(this.awayTimer);    this.awayTimer    = null; }
        if (this.offlineTimer) { clearTimeout(this.offlineTimer); this.offlineTimer = null; }

        const savedStatus = (localStorage.getItem('lastUserAvailability') || 'online') as any;
        await this.chatService.setUserStatus(savedStatus);
        this.startHeartbeat();
      }
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), this.HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async sendHeartbeat() {
    const status = localStorage.getItem('lastUserAvailability') || 'online';
    // Si el usuario se puso offline manualmente, no actualizar last_seen
    if (status === 'offline') return;
    await this.chatService.setUserStatus(status as any);
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
      LocalNotifications.addListener('localNotificationActionPerformed', (event: any) => {
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
    // En modo ocupado se suprimen los sonidos in-app; las notificaciones del SO sí suenan
    const myStatus = localStorage.getItem('lastUserAvailability') || 'online';
    if (myStatus !== 'busy') {
      this.buzzService.playNotification();
    }
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
