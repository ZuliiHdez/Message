import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FriendshipService } from '../services/friendship.service';

interface Member {
  id: string;
  name: string;
  color: string;
  photo: string;
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private friendshipService: FriendshipService,
  ) {}

  async ngOnInit() {
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
      this.members = profiles.map(p => ({
        id:    p.id,
        name:  p.full_name || p.username || (p as any).name || 'Member',
        color: this.colorFromId(p.id),
        photo: p.avatar_url || '',
      }));
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
