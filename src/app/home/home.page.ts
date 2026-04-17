import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { ChatService } from '../services/chat.service';
import { FriendshipService } from '../services/friendship.service';

interface Contact {
  id: string;
  name: string;
  bio: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  avatarColor: string;
  photoUrl: string;
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
  photoUrl?: string;
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
export class HomePage implements OnInit, OnDestroy {

  activeTab: 'chats' | 'grupos' = 'chats';
  searchQuery = '';
  showStatusMenu = false;

  currentUser = {
    name: 'Usuario',
    bio: 'Hey, estoy usando Orion',
    status: 'online' as 'online' | 'away' | 'busy' | 'offline',
    photoUrl: '',
  };

  allContacts: Contact[] = [];
  filteredContacts: Contact[] = [];
  groupedContacts: ContactGroup[] = [];
  filteredGroupCategories: GroupCategory[] = [];

  statusGroups = [
    { status: 'online'  as const, label: 'En línea' },
    { status: 'away'    as const, label: 'Ausente' },
    { status: 'busy'    as const, label: 'Ocupado' },
    { status: 'offline' as const, label: 'Desconectado' },
  ];

  groupCategories: GroupCategory[] = [];

  constructor(
    private router: Router,
    private chatService: ChatService,
    private friendshipService: FriendshipService
  ) {}

  async ngOnInit() {
    await this.chatService.setUserStatus('online');
    this.loadCurrentUser();
    await this.loadContacts();
    await this.loadGroups();
  }

  ionViewWillEnter() {
    this.loadCurrentUser();
    this.loadGroups();
  }

  private loadCurrentUser() {
    const stored = localStorage.getItem('lastUser');
    if (stored) {
      const user = JSON.parse(stored);
      this.currentUser.name     = user.name     || 'Usuario';
      this.currentUser.photoUrl = user.photoUrl || '';
      this.currentUser.bio      = user.status   || 'Hey, estoy usando Orion';
    }
  }

  async ngOnDestroy() {
    await this.chatService.setUserStatus('offline');
  }

  async loadContacts() {
    try {
      const friends = await this.friendshipService.getFriends();
      this.allContacts = friends.map(f => ({
        id:          f.id,
        name:        f.name,
        bio:         f.bio || '',
        status:      f.status,
        avatarColor: f.avatarColor,
        photoUrl:    f.avatarUrl || '',
      }));
    } catch (e) {
      console.error('Error cargando contactos:', e);
    }

    this.filterContacts();

    for (const contact of this.allContacts) {
      this.chatService.subscribeToUserStatus(contact.id, (status) => {
        const c = this.allContacts.find(x => x.id === contact.id);
        if (c) { c.status = status as any; this.filterContacts(); }
      });
    }
  }

  onSearch() {
    if (this.activeTab === 'chats') {
      this.filterContacts();
    } else {
      this.filterGroups();
    }
  }

  setTab(tab: 'chats' | 'grupos') {
    this.activeTab = tab;
    this.searchQuery = '';
    this.filterContacts();
    this.filteredGroupCategories = [...this.groupCategories];
  }

  filterContacts() {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredContacts = q
      ? this.allContacts.filter(c => c.name.toLowerCase().includes(q))
      : [...this.allContacts];
    this.buildGroups();
  }

  filterGroups() {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) {
      this.filteredGroupCategories = [...this.groupCategories];
      return;
    }
    this.filteredGroupCategories = this.groupCategories
      .map(cat => ({
        ...cat,
        expanded: true,
        groups: cat.groups.filter(g => g.name.toLowerCase().includes(q)),
      }))
      .filter(cat => cat.groups.length > 0);
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

  toggleStatusMenu() {
    this.showStatusMenu = !this.showStatusMenu;
  }

  async changeStatus(status: 'online' | 'away' | 'busy' | 'offline') {
    this.currentUser.status = status;
    this.showStatusMenu = false;
    await this.chatService.setUserStatus(status);
  }

  @HostListener('document:click')
  closeStatusMenu() {
    this.showStatusMenu = false;
  }

  getStatusLabel(status: string): string {
    const map: any = { online: 'En línea', away: 'Ausente', busy: 'Ocupado', offline: 'Desconectado' };
    return map[status] || 'Desconectado';
  }

  toggleCategory(cat: GroupCategory) {
    cat.expanded = !cat.expanded;
  }

  openChat(contact: Contact) {
    this.router.navigate(['/chat'], {
      queryParams: {
        id:    contact.id,
        name:  contact.name,
        bio:   contact.bio,
        color: contact.avatarColor,
        photo: contact.photoUrl || ''
      }
    });
  }

  async loadGroups() {
    try {
      const groups = await this.friendshipService.getGroups();
      this.groupCategories = groups.length > 0 ? [{
        name: 'Mis grupos',
        expanded: true,
        groups: groups.map(g => ({
          id: g.id,
          name: g.name,
          avatarColor: g.avatar_color || '#4a9fd4',
          photoUrl: g.avatar_url || '',
        })),
      }] : [];
    } catch (e) {
      console.error('Error cargando grupos:', e);
      this.groupCategories = [];
    }
    this.filteredGroupCategories = [...this.groupCategories];
  }

  openGroup(group: Group) {
    this.router.navigate(['/group-chat'], {
      queryParams: { id: group.id, name: group.name, color: group.avatarColor }
    });
  }

  addContact() {
    this.router.navigate(['/add-contact']);
  }

  createGroup() {
    this.router.navigate(['/create-group']);
  }

  goToHome() {
  }

  goToPeticiones() {
    this.router.navigate(['/peticiones']);
  }

  goToSettings() {
    this.router.navigate(['/edit-profile']);
  }
}
