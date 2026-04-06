// add-contact.page.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { FriendshipService } from '../services/friendship.service';

@Component({
  selector: 'app-add-contact',
  templateUrl: './add-contact.page.html',
  styleUrls: ['./add-contact.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class AddContactPage {

  searchQuery = '';
  results: any[] = [];
  loading = false;
  loadingIds: string[] = [];

  // Estado de relación por user id
  userStatuses: Record<string, 'none' | 'pending_sent' | 'pending_received' | 'accepted'> = {};

  private searchTimeout: any;

  // Colores para avatares sin foto
  private colors = ['#27ae60','#2980b9','#8e44ad','#e67e22','#c0392b','#16a085','#d35400'];

  constructor(
    private router: Router,
    private friendshipService: FriendshipService
  ) {}

  onSearch() {
    clearTimeout(this.searchTimeout);
    if (this.searchQuery.length < 2) {
      this.results = [];
      return;
    }
    this.loading = true;
    // Debounce 400ms para no hacer llamadas en cada tecla
    this.searchTimeout = setTimeout(() => this.doSearch(), 400);
  }

  async doSearch() {
    try {
      this.results = await this.friendshipService.searchUsers(this.searchQuery);
      // Cargar estado de amistad para cada resultado
      for (const user of this.results) {
        if (!this.userStatuses[user.id]) {
          this.userStatuses[user.id] =
            await this.friendshipService.getFriendshipStatus(user.id);
        }
      }
    } catch (e) {
      console.error('Error buscando usuarios:', e);
    } finally {
      this.loading = false;
    }
  }

  clearSearch() {
    this.searchQuery = '';
    this.results = [];
  }

  async handleAction(user: any) {
    const status = this.userStatuses[user.id];
    if (status === 'pending_sent' || status === 'accepted') return;

    this.loadingIds.push(user.id);
    try {
      await this.friendshipService.sendFriendRequest(user.id);
      this.userStatuses[user.id] = 'pending_sent';
    } catch (e) {
      console.error('Error enviando petición:', e);
    } finally {
      this.loadingIds = this.loadingIds.filter(id => id !== user.id);
    }
  }

  getButtonClass(userId: string): string {
    switch (this.userStatuses[userId]) {
      case 'pending_sent':  return 'btn-pending';
      case 'accepted':      return 'btn-accepted';
      default:              return 'btn-add';
    }
  }

  getAvatarColor(userId: string): string {
    const index = userId.charCodeAt(0) % this.colors.length;
    return this.colors[index];
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
