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
    bio: 'Hey, I\'m using Orion',
    status: 'online' as 'online' | 'away' | 'busy' | 'offline',
    photoUrl: '',
  };

  allContacts: Contact[] = [];
  filteredContacts: Contact[] = [];
  groupedContacts: ContactGroup[] = [];
  filteredGroupCategories: GroupCategory[] = [];
  lastMessagePreviews = new Map<string, { prefix: string; icon?: string; text: string }>();
  lastGroupMessagePreviews = new Map<string, { prefix: string; icon?: string; text: string }>();

  statusGroups = [
    { status: 'online'  as const, label: 'Online' },
    { status: 'away'    as const, label: 'Away' },
    { status: 'busy'    as const, label: 'Busy' },
    { status: 'offline' as const, label: 'Offline' },
  ];

  groupCategories: GroupCategory[] = [];

  private myId = '';
  private profileChannel: any = null;

  constructor(
    private router: Router,
    private chatService: ChatService,
    private friendshipService: FriendshipService
  ) {}

  async ngOnInit() {
    await this.chatService.setUserStatus('online');
    this.myId = await this.chatService.getCurrentUserId();
    this.loadCurrentUser();
    await this.loadContacts();
    await this.loadGroups();

    // Suscripción en tiempo real: cuando cambia contacts del perfil propio, recargar lista
    this.profileChannel = this.chatService.subscribeToProfileContacts(this.myId, () => {
      this.loadContacts();
    });
  }

  async ionViewWillEnter() {
    this.myId = await this.chatService.getCurrentUserId();
    this.lastMessagePreviews.clear();
    this.lastGroupMessagePreviews.clear();
    this.loadCurrentUser();
    this.loadContacts();
    this.loadGroups();
  }

  private loadCurrentUser() {
    const stored = localStorage.getItem('lastUser');
    if (stored) {
      const user = JSON.parse(stored);
      this.currentUser.name     = user.name     || 'User';
      this.currentUser.photoUrl = user.photoUrl || '';
      this.currentUser.bio      = user.status   || 'Hey, I\'m using Orion';
    }
  }

  async ngOnDestroy() {
    await this.chatService.setUserStatus('offline');
    this.chatService.unsubscribeStatusChannels();
    if (this.profileChannel) {
      this.chatService.unsubscribeContactsStatus(this.profileChannel);
      this.profileChannel = null;
    }
  }

  loadingContacts = false;
  loadingGroups   = false;

  async loadContacts() {
    this.loadingContacts = true;
    this.chatService.unsubscribeStatusChannels();

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

    this.loadingContacts = false;
    this.filterContacts();
    this.loadLastMessages();

    for (const contact of this.allContacts) {
      this.chatService.subscribeToUserStatus(contact.id, (status) => {
        const c = this.allContacts.find(x => x.id === contact.id);
        if (c) { c.status = status as any; this.filterContacts(); }
      });
    }
  }

  private async loadLastMessages() {
    const myId = this.myId;
    await Promise.all(this.allContacts.map(async c => {
      try {
        const msg = await this.chatService.getLastMessage(c.id);
        if (!msg) return;
        const isMine = msg.sender_id === myId;
        const prefix = isMine ? 'Me' : c.name;
        let icon: string | undefined;
        let text: string;
        if (msg.is_photo_bomb) {
          if (isMine) {
            icon = msg.image_url ? 'lock-closed-outline' : 'eye-outline';
            text = msg.image_url ? 'Private photo' : 'Image seen';
          } else {
            icon = msg.image_url ? 'eye-outline' : 'eye-off-outline';
            text = msg.image_url ? 'Open image' : 'Image deleted';
          }
        } else if (msg.image_url) {
          icon = 'camera-outline';
          text = 'Image';
        } else {
          text = msg.content || '';
        }
        this.lastMessagePreviews.set(c.id, { prefix, icon, text });
      } catch {}
    }));
  }

  getLastMsg(contactId: string): { prefix: string; icon?: string; text: string } | null {
    return this.lastMessagePreviews.get(contactId) ?? null;
  }

  getLastGroupMsg(groupId: string): { prefix: string; icon?: string; text: string } | null {
    return this.lastGroupMessagePreviews.get(groupId) ?? null;
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
    const map: any = { online: 'Online', away: 'Away', busy: 'Busy', offline: 'Offline' };
    return map[status] || 'Offline';
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
    this.loadingGroups = true;
    try {
      const groups = await this.friendshipService.getGroups();
      this.groupCategories = groups.length > 0 ? [{
        name: 'My groups',
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
    this.loadingGroups = false;
    this.loadLastGroupMessages();
  }

  private async loadLastGroupMessages() {
    const myId = this.myId;
    const allGroups: Group[] = ([] as Group[]).concat(...this.groupCategories.map((cat: GroupCategory) => cat.groups));
    await Promise.all(allGroups.map(async g => {
      try {
        const msg = await this.chatService.getLastGroupMessage(g.id);
        if (!msg) return;
        const isMine = msg.sender_id === myId;
        let senderName = 'Member';
        if (isMine) {
          senderName = 'Me';
        } else {
          const contact = this.allContacts.find(c => c.id === msg.sender_id);
          if (contact) {
            senderName = contact.name;
          } else {
            const name = await this.friendshipService.getProfileName(msg.sender_id);
            if (name) senderName = name;
          }
        }
        let icon: string | undefined;
        let text: string;
        if (msg.is_photo_bomb) {
          icon = isMine
            ? (msg.image_url ? 'lock-closed-outline' : 'eye-outline')
            : (msg.image_url ? 'eye-outline' : 'eye-off-outline');
          text = isMine
            ? (msg.image_url ? 'Private photo' : 'Image seen')
            : (msg.image_url ? 'Open image' : 'Image deleted');
        } else if (msg.image_url) {
          icon = 'camera-outline';
          text = 'Image';
        } else {
          text = msg.content || '';
        }
        this.lastGroupMessagePreviews.set(g.id, { prefix: senderName, icon, text });
      } catch {}
    }));
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
    this.router.navigate(['/settings']);
  }

  goToProfile() {
    this.router.navigate(['/edit-profile']);
  }
}
