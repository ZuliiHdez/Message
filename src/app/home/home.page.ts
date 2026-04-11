import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

interface Contact {
  id: string;
  name: string;
  bio: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  avatarColor: string;
}

interface ContactGroup {
  status: 'online' | 'away' | 'busy' | 'offline';
  label: string;
  contacts: Contact[];
}

interface Group {
  id: number;
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
export class HomePage implements OnInit {

  activeTab: 'chats' | 'grupos' = 'chats';
  searchQuery = '';

  currentUser = {
    name: 'Iria',
    bio: 'Soy nueva',
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

  groupCategories: GroupCategory[] = [
    {
      name: 'Amigos',
      expanded: false,
      groups: [
        { id: 1, name: 'Grupo Amigos',  avatarColor: '#27ae60' },
        { id: 2, name: 'Salidas finde', avatarColor: '#2980b9' },
      ]
    },
    {
      name: 'Trabajo',
      expanded: true,
      groups: [
        { id: 3, name: 'Grupo PAMN',    avatarColor: '#e74c3c' },
        { id: 4, name: 'Trabajo tarde', avatarColor: '#f39c12' },
        { id: 5, name: 'Proyecto TFG',  avatarColor: '#7f8c8d' },
      ]
    },
    {
      name: 'Familia',
      expanded: true,
      groups: [
        { id: 6, name: 'Family', avatarColor: '#8e44ad' },
      ]
    },
    {
      name: 'Sin asignar',
      expanded: false,
      groups: []
    },
  ];

  constructor(
  private router: Router,
  private supabaseService: SupabaseService
) {}

async ngOnInit() {
  const stored = localStorage.getItem('lastUser');
  if (stored) {
    const user = JSON.parse(stored);
    this.currentUser.name = user.name || 'Usuario';
    this.currentUser.photoUrl = user.photoUrl || '';
    this.currentUser.bio = user.status || 'Hey, estoy usando Orion';
  }

  await this.loadContacts();
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
    console.log('CONTACT OBJ:', contact);
    this.router.navigate(['/chat'], {
      queryParams: {
        id: contact.id,
        name: contact.name,
        color: contact.avatarColor,
      }
    });
  }

  openGroup(group: Group) {
    this.router.navigate(['/chat'], {
      queryParams: {
        id: group.id,
        name: group.name,
        color: group.avatarColor,
        photo: group.photoUrl || '',
      }
    });
  }

  goToSettings() {
  }

  goToAddContact() {
    this.router.navigate(['/add-contact']);
  }

  goToPeticiones() {
    this.router.navigate(['/peticiones']);
  }
  async loadContacts() {
  const client = this.supabaseService.getClient();

  const {
    data: { session }
  } = await client.auth.getSession();

  const myId = session?.user?.id;
  if (!myId) return;

  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, status')
    .neq('id', myId);

  if (error) {
    console.error('Fehler beim Laden der Kontakte:', error);
    return;
  }

  this.allContacts = (data || []).map((profile: any) => ({
    id: profile.id,
    name: profile.full_name || 'Sin nombre',
    bio: profile.status || '',
    status: 'offline',
    avatarColor: '#7f8c8d',
  }));

  this.filterContacts();
}
}