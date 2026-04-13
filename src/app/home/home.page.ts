import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { FriendshipService } from '../services/friendship.service';

interface Contact {
  id: string;
  name: string;
  bio: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  avatarColor: string;
  avatarUrl: string;
}

interface ContactGroup {
  status: 'online' | 'away' | 'busy' | 'offline';
  label: string;
  contacts: Contact[];
}

interface Group {
  id: string;
  name: string;
  avatarColor: string;
  avatarUrl?: string;
}

interface GroupCategory {
  name: string;
  expanded: boolean;
  groups: Group[];
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class HomePage implements OnInit {

  activeTab: 'chats' | 'grupos' = 'chats';
  searchQuery = '';
  isLoading = false;

  currentUser = {
    name: 'Usuario',
    bio: 'Hey, estoy usando Orion',
    status: 'online',
    photoUrl: '',
  };

  allContacts: Contact[] = [];
  filteredContacts: Contact[] = [];
  groupedContacts: ContactGroup[] = [];

  statusGroups = [
    { status: 'online'  as const, label: 'En línea' },
    { status: 'away'    as const, label: 'Ausente' },
    { status: 'busy'    as const, label: 'Ocupado' },
    { status: 'offline' as const, label: 'Desconectado' },
  ];

  groupCategories: GroupCategory[] = [];

  constructor(private router: Router, private friendshipService: FriendshipService) {}

  async ngOnInit() {
    const stored = localStorage.getItem('lastUser');
    if (stored) {
      const user = JSON.parse(stored);
      this.currentUser.name     = user.name     || 'Usuario';
      this.currentUser.photoUrl = user.photoUrl || '';
      this.currentUser.bio      = user.status   || 'Hey, estoy usando Orion';
    }
    await this.loadData();
  }

  async loadData() {
    this.isLoading = true;
    try {
      await Promise.all([this.loadContacts(), this.loadGroups()]);
    } finally {
      this.isLoading = false;
    }
  }

  async loadContacts() {
    try {
      const friends = await this.friendshipService.getFriends();
      this.allContacts = friends;
      this.filterContacts();
    } catch (e) {
      console.error('Error cargando contactos:', e);
    }
  }

  async loadGroups() {
    try {
      const groups = await this.friendshipService.getGroups();
      if (groups.length > 0) {
        this.groupCategories = [{
          name: 'Mis grupos',
          expanded: true,
          groups: groups.map(g => ({
            id: g.id,
            name: g.name,
            avatarColor: '#2980b9',
            avatarUrl: g.avatar_url || '',
          })),
        }];
      } else {
        this.groupCategories = [];
      }
    } catch (e) {
      console.error('Error cargando grupos:', e);
      this.groupCategories = [];
    }
  }

  filterContacts() {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredContacts = q
      ? this.allContacts.filter(c =>
          c.name.toLowerCase().includes(q) || c.bio.toLowerCase().includes(q))
      : [...this.allContacts];
    this.buildGroups();
  }

  buildGroups() {
    this.groupedContacts = this.statusGroups
      .map(g => ({
        status: g.status,
        label: g.label,
        contacts: this.filteredContacts.filter(c => c.status === g.status),
      }))
      .filter(g => g.contacts.length > 0);
  }

  toggleCategory(category: GroupCategory) {
    category.expanded = !category.expanded;
  }

  openChat(contact: Contact) {
    this.router.navigate(['/chat'], {
      queryParams: {
        id: contact.id,
        name: contact.name,
        color: contact.avatarColor,
        photo: contact.avatarUrl || '',
      }
    });
  }

  openGroup(group: Group) {
    this.router.navigate(['/chat'], {
      queryParams: {
        id: group.id,
        name: group.name,
        color: group.avatarColor,
        photo: group.avatarUrl || '',
      }
    });
  }

  goToCrearGrupo() {
    this.router.navigate(['/create-group']);
  }

  goToSettings() {
  }

  goToAddContact() {
    this.router.navigate(['/add-contact']);
  }

  goToPeticiones() {
    this.router.navigate(['/peticiones']);
  }
}
