import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FriendshipService } from '../services/friendship.service';
import { ChatService } from '../services/chat.service';
import { LanguageService } from '../services/language.service';

interface Member {
  id: string;
  name: string;
  color: string;
  photo: string;
  isMe: boolean;
}

@Component({
  selector: 'app-group-detail',
  templateUrl: './group-detail.page.html',
  styleUrls: ['./group-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class GroupDetailPage implements OnInit {

  group = { id: '', name: '', color: '#4a9fd4', memberCount: 0 };
  members: Member[] = [];
  loading = false;
  private myId = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private friendshipService: FriendshipService,
    private chatService: ChatService,
    public lang: LanguageService,
  ) {}

  async ngOnInit() {
    this.myId = await this.chatService.getCurrentUserId();
    this.route.queryParams.subscribe(async p => {
      this.group.id    = p['id']    || '';
      this.group.name  = p['name']  || 'Group';
      this.group.color = p['color'] || '#4a9fd4';
      await this.loadMembers();
    });
  }

  async loadMembers() {
    if (!this.group.id) return;
    this.loading = true;
    try {
      const { count, profiles } = await this.friendshipService.getGroupMembers(this.group.id);
      this.group.memberCount = count;
      this.members = profiles.map(p => {
        const isMe = p.id === this.myId;
        return {
          id:    p.id,
          name:  isMe ? this.lang.t('chat_me') : (p.full_name || p.username || this.lang.t('chat_member')),
          color: this.colorFromId(p.id),
          photo: p.avatar_url || '',
          isMe,
        };
      }).sort((a, b) => (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0));
    } catch (e) {
      console.error('Error loading group members:', e);
    }
    this.loading = false;
  }

  colorFromId(id: string): string {
    const colors = ['#27ae60', '#2980b9', '#e67e22', '#8e44ad', '#c0392b', '#d35400', '#16a085', '#f39c12'];
    return colors[id.charCodeAt(0) % colors.length];
  }

  goBack() {
    this.location.back();
  }
}
