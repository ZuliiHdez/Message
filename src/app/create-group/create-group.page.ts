import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { FriendshipService } from '../services/friendship.service';
import { LanguageService } from '../services/language.service';

interface Contact {
  id: string;
  name: string;
  username: string;
  avatarColor: string;
  avatarUrl: string;
  selected: boolean;
}

@Component({
  selector: 'app-crear-grupo',
  templateUrl: './create-group.page.html',
  styleUrls: ['./create-group.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class CreateGroupPage implements OnInit {

  groupName = '';
  selectedColor = '#4a9fd4';
  contacts: Contact[] = [];
  loading = false;
  creating = false;
  errorMsg = '';

  readonly palette = [
    '#4a9fd4', '#27ae60', '#8e44ad', '#e67e22',
    '#e74c3c', '#16a085', '#2c3e50', '#d35400',
  ];

  constructor(
    private router: Router,
    private friendshipService: FriendshipService,
    public lang: LanguageService,
  ) {}

  async ngOnInit() {
    this.loading = true;
    try {
      const friends = await this.friendshipService.getFriends();
      this.contacts = friends.map(f => ({
        id: f.id,
        name: f.name,
        username: f.bio,
        avatarColor: f.avatarColor,
        avatarUrl: f.avatarUrl,
        selected: false,
      }));
    } catch (e) {
      console.error('Error cargando contactos:', e);
    } finally {
      this.loading = false;
    }
  }

  toggleContact(contact: Contact) {
    contact.selected = !contact.selected;
  }

  get selectedCount(): number {
    return this.contacts.filter(c => c.selected).length;
  }

  get canCreate(): boolean {
    return this.groupName.trim().length > 0 && this.selectedCount > 0;
  }

  async createGroup() {
    if (!this.canCreate || this.creating) return;
    this.creating = true;
    this.errorMsg = '';

    try {
      const memberIds = this.contacts.filter(c => c.selected).map(c => c.id);
      await this.friendshipService.createGroup(this.groupName.trim(), this.selectedColor, memberIds);
      this.router.navigate(['/home']);
    } catch (e: any) {
      this.errorMsg = this.lang.t('create_group_error');
      console.error(e);
    } finally {
      this.creating = false;
    }
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
