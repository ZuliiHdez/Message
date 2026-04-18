import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from 'src/app/services/supabase.service';
import { ChatService } from 'src/app/services/chat.service';
import { LanguageService } from 'src/app/services/language.service';

@Component({
  selector: 'app-edit-profile',
  templateUrl: './edit-profile.page.html',
  styleUrls: ['./edit-profile.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class EditProfilePage implements OnInit {

  @ViewChild('avatarInput') avatarInput!: ElementRef;

  fullName = '';
  username = '';
  personalMessage = '';
  photoUrl = '';
  loading = false;
  isEditing = false;

  statusEmoji = '';
  statusText = '';
  showEmojiGrid = false;
  showAvailabilityMenu = false;
  availability: 'online' | 'away' | 'busy' | 'offline' = 'online';

  readonly commonEmojis = [
    '😊','😂','❤️','🔥','✨','🎉','😎','🤔',
    '💪','🙏','😍','🚀','💯','😅','🎵','⚡',
    '🌙','☀️','🌊','🌸','🦋','🏆','💻','🎮',
  ];

  constructor(
    private router: Router,
    private supabase: SupabaseService,
    private chatService: ChatService,
    public lang: LanguageService
  ) {}

  async ngOnInit() {
    const { data: session } = await this.supabase.getClient().auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;

    const { data: profile } = await this.supabase.getClient()
      .from('profiles')
      .select('full_name, username, status, avatar_url, user_status')
      .eq('id', userId)
      .single();

    if (profile) {
      this.fullName        = profile.full_name  || '';
      this.username        = profile.username   || '';
      this.personalMessage = profile.status     || '';
      this.photoUrl        = profile.avatar_url || '';
      this.availability    = (profile.user_status as any) || 'online';
      this.parsePersonalMessage();
    }
  }

  private parsePersonalMessage() {
    if (!this.personalMessage) { this.statusEmoji = ''; this.statusText = ''; return; }
    const firstChar = [...this.personalMessage][0];
    const cp = firstChar.codePointAt(0) ?? 0;
    if (cp > 0x00FF) {
      const spaceIdx = this.personalMessage.indexOf(' ');
      if (spaceIdx > 0 && spaceIdx <= 4) {
        this.statusEmoji = this.personalMessage.slice(0, spaceIdx);
        this.statusText  = this.personalMessage.slice(spaceIdx + 1);
      } else {
        this.statusEmoji = firstChar;
        this.statusText  = this.personalMessage.slice(firstChar.length).replace(/^\s+/, '');
      }
    } else {
      this.statusEmoji = '';
      this.statusText  = this.personalMessage;
    }
  }

  toggleAvailabilityMenu(event: Event) {
    event.stopPropagation();
    this.showAvailabilityMenu = !this.showAvailabilityMenu;
  }

  async changeAvailability(status: 'online' | 'away' | 'busy' | 'offline') {
    this.availability = status;
    this.showAvailabilityMenu = false;
    localStorage.setItem('lastUserAvailability', status);
    await this.chatService.setUserStatus(status);
  }

  @HostListener('document:click')
  closeAvailabilityMenu() { this.showAvailabilityMenu = false; }

  pickEmoji(e: string) {
    this.statusEmoji = e;
    this.showEmojiGrid = false;
  }

  pickAvatar() {
    this.avatarInput.nativeElement.click();
  }

  async onAvatarSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => { this.photoUrl = e.target.result; };
    reader.readAsDataURL(file);

    const { data: session } = await this.supabase.getClient().auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;

    const ext  = file.name.split('.').pop();
    const path = `avatars/${userId}.${ext}`;

    const { error } = await this.supabase.getClient().storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (!error) {
      const { data } = this.supabase.getClient().storage
        .from('avatars')
        .getPublicUrl(path);
      this.photoUrl = data.publicUrl;
    }
  }

  startEditing() {
    this.showEmojiGrid = false;
    this.isEditing = true;
  }

  cancelEditing() {
    this.isEditing = false;
    this.showEmojiGrid = false;
    this.parsePersonalMessage();
  }

  async save() {
    this.loading = true;
    this.personalMessage = this.statusEmoji
      ? `${this.statusEmoji} ${this.statusText.trim()}`
      : this.statusText.trim();

    const { data: session } = await this.supabase.getClient().auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) { this.loading = false; return; }

    const { error } = await this.supabase.getClient()
      .from('profiles')
      .update({
        full_name:  this.fullName,
        status:     this.personalMessage,
        avatar_url: this.photoUrl,
      })
      .eq('id', userId);

    if (!error) {
      const stored = localStorage.getItem('lastUser');
      if (stored) {
        const user = JSON.parse(stored);
        user.name     = this.fullName;
        user.status   = this.personalMessage;
        user.photoUrl = this.photoUrl;
        localStorage.setItem('lastUser', JSON.stringify(user));
      }
      this.isEditing = false;
    }

    this.loading = false;
  }

  async logout() {
    await this.chatService.setUserStatus('offline');
    await this.supabase.getClient().auth.signOut();
    localStorage.removeItem('lastUser');
    this.router.navigate(['/login']);
  }

  goToHome() { this.router.navigate(['/home']); }
  goToCreateGroup() { this.router.navigate(['/create-group']); }
  goToRequests() { this.router.navigate(['/peticiones']); }
}
