import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { IonicModule, AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { LanguageService } from '../services/language.service';
import { FriendshipService } from '../services/friendship.service';
import { ChatService } from '../services/chat.service';

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'pdf' | 'document';
  filename: string;
  sentAt: string;
  isMine: boolean;
}

interface MediaGroup {
  key: string;
  label: string;
  expanded: boolean;
  items: MediaItem[];
}

@Component({
  selector: 'app-contact-detail',
  templateUrl: './contact-detail.page.html',
  styleUrls: ['./contact-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class ContactDetailPage implements OnInit {

  contact = {
    id: '',
    name: '',
    bio: '',
    status: 'offline' as 'online' | 'away' | 'busy' | 'offline',
    color: '#4a9fd4',
    photo: '',
  };

  showMediaViewer = false;
  mediaItems: MediaItem[] = [];
  mediaGroups: MediaGroup[] = [];
  loadingMedia = false;
  viewerIndex = -1;
  private myId = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private alertCtrl: AlertController,
    private friendshipService: FriendshipService,
    private chatService: ChatService,
    public lang: LanguageService,
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(p => {
      this.contact.id     = p['id']     || '';
      this.contact.name   = p['name']   || '';
      this.contact.bio    = p['bio']    || '';
      this.contact.status = p['status'] || 'offline';
      this.contact.color  = p['color']  || '#4a9fd4';
      this.contact.photo  = p['photo']  || '';
    });
  }

  getStatusLabel(s: string): string {
    const map: Record<string, string> = {
      online:  this.lang.t('status_online'),
      away:    this.lang.t('status_away'),
      busy:    this.lang.t('status_busy'),
      offline: this.lang.t('status_offline'),
    };
    return map[s] || this.lang.t('status_offline');
  }

  goBack() {
    this.location.back();
  }

  async deleteFriendship() {
    const alert = await this.alertCtrl.create({
      header: this.lang.t('detail_delete_friendship'),
      message: this.lang.t('detail_delete_confirm_msg'),
      buttons: [
        { text: this.lang.t('chat_cancel'), role: 'cancel' },
        {
          text: this.lang.t('detail_delete_btn'),
          role: 'destructive',
          cssClass: 'alert-danger-btn',
          handler: () => {
            this.friendshipService.removeFriend(this.contact.id)
              .catch(e => console.error('Error eliminando amistad:', e))
              .finally(() => this.router.navigate(['/home']));
          },
        },
      ],
    });
    await alert.present();
  }

  async blockContact() {
    const alert = await this.alertCtrl.create({
      header: this.lang.t('detail_block'),
      message: this.lang.t('detail_block_confirm_msg'),
      buttons: [
        { text: this.lang.t('chat_cancel'), role: 'cancel' },
        {
          text: this.lang.t('detail_block'),
          role: 'destructive',
          cssClass: 'alert-danger-btn',
          handler: () => {
            this.friendshipService.blockUser(this.contact.id)
              .catch(e => console.error('Error bloqueando:', e))
              .finally(() => this.router.navigate(['/home']));
          },
        },
      ],
    });
    await alert.present();
  }

  async openSharedMedia() {
    this.showMediaViewer = true;
    this.loadingMedia = true;
    this.viewerIndex = -1;
    this.mediaItems = [];
    try {
      if (!this.myId) this.myId = await this.chatService.getCurrentUserId();
      const messages = await this.chatService.getMessages(this.contact.id);
      this.mediaItems = (messages as any[])
        .filter(m => m.image_url && !m.is_photo_bomb && !m.is_deleted)
        .map(m => ({
          id:       m.id,
          url:      m.image_url,
          type:     this.getFileType(m.image_url),
          filename: this.extractFilename(m.image_url),
          sentAt:   m.created_at,
          isMine:   m.sender_id === this.myId,
        }))
        .reverse();
    } catch (e) {
      console.error('Error cargando medios:', e);
    }
    this.loadingMedia = false;
    this.mediaGroups = this.buildMediaGroups();
  }

  private getDateGroupKey(sentAt: string): string {
    const d = new Date(sentAt);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const dow = today.getDay() === 0 ? 7 : today.getDay();
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - dow + 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (msgDay.getTime() === today.getTime())     return 'today';
    if (msgDay.getTime() === yesterday.getTime()) return 'yesterday';
    if (msgDay >= startOfWeek)                    return 'this_week';
    if (msgDay >= startOfMonth)                   return 'this_month';
    if (d.getFullYear() === now.getFullYear())     return 'this_year';
    return 'past_years';
  }

  private buildMediaGroups(): MediaGroup[] {
    const order = ['today','yesterday','this_week','this_month','this_year','past_years'];
    const labelKey: Record<string, string> = {
      today:      'detail_mg_today',
      yesterday:  'detail_mg_yesterday',
      this_week:  'detail_mg_this_week',
      this_month: 'detail_mg_this_month',
      this_year:  'detail_mg_this_year',
      past_years: 'detail_mg_past_years',
    };
    const buckets: Record<string, MediaItem[]> = {};
    for (const item of this.mediaItems) {
      const key = this.getDateGroupKey(item.sentAt);
      (buckets[key] ??= []).push(item);
    }
    return order
      .filter(k => buckets[k]?.length)
      .map((k, i) => ({ key: k, label: this.lang.t(labelKey[k]), expanded: i === 0, items: buckets[k] }));
  }

  openGroupItem(group: MediaGroup, localIndex: number) {
    const globalIndex = this.mediaItems.findIndex(m => m.id === group.items[localIndex].id);
    this.viewerIndex = globalIndex;
  }

  closeMediaViewer() {
    this.showMediaViewer = false;
    this.mediaItems = [];
    this.viewerIndex = -1;
  }

  handleMediaBack() {
    if (this.viewerIndex >= 0) {
      this.viewerIndex = -1;
    } else {
      this.closeMediaViewer();
    }
  }

  private getFileType(url: string): 'image' | 'pdf' | 'document' {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'pdf';
    if (['doc','docx','xls','xlsx','ppt','pptx','txt','csv'].includes(ext)) return 'document';
    return 'image';
  }

  private extractFilename(url: string): string {
    try {
      return decodeURIComponent(url.split('?')[0]).split('/').pop() || 'file';
    } catch {
      return 'file';
    }
  }

  openChat() {
    this.router.navigate(['/chat'], {
      queryParams: {
        id:     this.contact.id,
        name:   this.contact.name,
        bio:    this.contact.bio,
        color:  this.contact.color,
        photo:  this.contact.photo,
        status: this.contact.status,
      },
    });
  }
}
