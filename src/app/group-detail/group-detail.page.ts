import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FriendshipService } from '../services/friendship.service';
import { ChatService } from '../services/chat.service';
import { LanguageService } from '../services/language.service';
import { SupabaseService } from '../services/supabase.service';

type GroupRole = 'member' | 'admin' | 'owner';

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'pdf' | 'document';
  filename: string;
  sentAt: string;
}

interface MediaGroup {
  key: string;
  label: string;
  expanded: boolean;
  items: MediaItem[];
}

interface Member {
  id: string;
  name: string;
  color: string;
  photo: string;
  isMe: boolean;
  role: GroupRole;
}

interface AvailableContact {
  id: string;
  name: string;
  username: string;
  color: string;
  photo: string;
  selected: boolean;
}

const COLOR_PALETTE = [
  '#4a9fd4', '#27ae60', '#8e44ad', '#e67e22',
  '#c0392b', '#16a085', '#2980b9', '#f39c12',
];

@Component({
  selector: 'app-group-detail',
  templateUrl: './group-detail.page.html',
  styleUrls: ['./group-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class GroupDetailPage implements OnInit, OnDestroy {

  @ViewChild('groupImageInput') groupImageInput!: ElementRef;

  group = { id: '', name: '', color: '#4a9fd4', memberCount: 0, photo: '' };
  members: Member[] = [];
  loading = false;
  myRole: GroupRole = 'member';
  readonly colorPalette = COLOR_PALETTE;

  // Edit group sheet
  showEditSheet = false;
  editName = '';
  editColor = '#4a9fd4';
  editPhoto = '';
  editPhotoFile: File | null = null;
  editTab: 'color' | 'image' = 'color';
  savingEdit = false;

  // Add member sheet
  showAddMember = false;
  availableContacts: AvailableContact[] = [];
  addMemberSearch = '';
  addingMembers = false;

  // Member actions sheet
  showMemberActions = false;
  memberActionsTarget: Member | null = null;
  memberActionsList: Array<{ icon: string; label: string; destructive?: boolean; handler: () => void }> = [];

  // Shared media viewer
  showMediaViewer = false;
  mediaItems: MediaItem[] = [];
  mediaGroups: MediaGroup[] = [];
  loadingMedia = false;
  viewerIndex = -1;

  // Transfer ownership sheet
  showTransferSheet = false;
  transferCandidates: Member[] = [];
  transferTarget: Member | null = null;
  transferring = false;

  get filteredAvailable(): AvailableContact[] {
    const q = this.addMemberSearch.toLowerCase().trim();
    if (!q) return this.availableContacts;
    return this.availableContacts.filter(c =>
      c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)
    );
  }

  get selectedToAdd(): AvailableContact[] {
    return this.availableContacts.filter(c => c.selected);
  }

  get isAdmin() { return this.myRole === 'admin' || this.myRole === 'owner'; }
  get isOwner() { return this.myRole === 'owner'; }

  private myId = '';
  private groupChannel: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private alertCtrl: AlertController,
    private friendshipService: FriendshipService,
    private chatService: ChatService,
    private supabase: SupabaseService,
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

  ionViewWillEnter() {
    if (!this.group.id) return;
    this.friendshipService.removeChannel(this.groupChannel);
    this.groupChannel = this.friendshipService.subscribeToGroupChanges(this.group.id, (data) => {
      if (data.name)        this.group.name  = data.name;
      if (data.avatar_color) this.group.color = data.avatar_color;
      this.group.photo = data.avatar_url || '';
    });
  }

  ionViewWillLeave() {
    this.friendshipService.removeChannel(this.groupChannel);
    this.groupChannel = null;
  }

  ngOnDestroy() {
    this.friendshipService.removeChannel(this.groupChannel);
  }

  async loadMembers() {
    if (!this.group.id) return;
    this.loading = true;
    try {
      const [groupInfo, { count, profiles }] = await Promise.all([
        this.friendshipService.getGroupInfo(this.group.id),
        this.friendshipService.getGroupMembers(this.group.id),
      ]);
      if (groupInfo) {
        this.group.name  = groupInfo.name || this.group.name;
        this.group.color = groupInfo.avatar_color || this.group.color;
        this.group.photo = groupInfo.avatar_url || '';
      }
      this.group.memberCount = count;
      this.members = profiles.map(p => {
        const isMe = p.id === this.myId;
        return {
          id:    p.id,
          name:  isMe ? this.lang.t('chat_me') : (p.full_name || p.username || this.lang.t('chat_member')),
          color: this.colorFromId(p.id),
          photo: p.avatar_url || '',
          isMe,
          role:  (p.role || 'member') as GroupRole,
        };
      });
      const me = this.members.find(m => m.isMe);
      this.myRole = me?.role || 'member';
      this.sortMembers();
    } catch (e) {
      console.error('Error loading group members:', e);
    }
    this.loading = false;
  }

  private sortMembers() {
    const order: Record<GroupRole, number> = { owner: 0, admin: 1, member: 2 };
    this.members.sort((a, b) => {
      const diff = order[a.role] - order[b.role];
      if (diff !== 0) return diff;
      return (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0);
    });
  }

  canActOn(member: Member): boolean {
    if (this.myRole === 'member') return false;
    if (this.myRole === 'admin') return member.role === 'member';
    if (this.myRole === 'owner') return member.role !== 'owner';
    return false;
  }

  // ── Edit group sheet ─────────────────────

  openEditSheet() {
    this.editName      = this.group.name;
    this.editColor     = this.group.color;
    this.editPhoto     = this.group.photo;
    this.editPhotoFile = null;
    this.editTab       = this.group.photo ? 'image' : 'color';
    this.showEditSheet = true;
  }

  closeEditSheet() {
    this.showEditSheet = false;
  }

  selectEditColor(color: string) {
    this.editColor     = color;
    this.editTab       = 'color';
    this.editPhoto     = '';
    this.editPhotoFile = null;
  }

  pickGroupImage() {
    this.groupImageInput.nativeElement.click();
  }

  onGroupImageSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.editPhotoFile = file;
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      this.editPhoto = (e.target?.result as string) || '';
    };
    reader.readAsDataURL(file);
    this.editTab = 'image';
  }

  async saveGroupEdit() {
    const name = this.editName.trim();
    if (!name || this.savingEdit) return;
    this.savingEdit = true;
    try {
      let photoUrl = this.group.photo;

      if (this.editPhotoFile) {
        const ext  = this.editPhotoFile.name.split('.').pop();
        const path = `group-${this.group.id}.${ext}`;
        const { error: upErr } = await this.supabase.getClient().storage
          .from('group-avatars')
          .upload(path, this.editPhotoFile, { upsert: true });
        if (upErr) {
          console.error('Upload error:', upErr);
        } else {
          const { data } = this.supabase.getClient().storage.from('group-avatars').getPublicUrl(path);
          photoUrl = data.publicUrl;
        }
      } else if (this.editTab === 'color') {
        photoUrl = '';
      }

      await this.friendshipService.updateGroupInfo(this.group.id, name, this.editColor);
      if (photoUrl !== this.group.photo) {
        await this.friendshipService.updateGroupAvatarUrl(this.group.id, photoUrl);
      }

      this.group.name  = name;
      this.group.color = this.editColor;
      this.group.photo = photoUrl;
      this.closeEditSheet();
    } catch (e) {
      console.error('Error saving group edit:', e);
    }
    this.savingEdit = false;
  }

  // ── Add member sheet ─────────────────────

  async openAddMember() {
    try {
      const friends = await this.friendshipService.getFriends();
      const memberIds = new Set(this.members.map(m => m.id));
      this.availableContacts = friends
        .filter(f => !memberIds.has(f.id))
        .map(f => ({
          id:       f.id,
          name:     f.name,
          username: f.bio || '',
          color:    f.avatarColor,
          photo:    f.avatarUrl || '',
          selected: false,
        }));
    } catch (e) {
      console.error('Error loading friends:', e);
      this.availableContacts = [];
    }
    this.addMemberSearch = '';
    this.showAddMember = true;
  }

  closeAddMember() {
    this.showAddMember = false;
    this.availableContacts = [];
    this.addMemberSearch = '';
  }

  toggleAddContact(c: AvailableContact) {
    c.selected = !c.selected;
  }

  async confirmAddMembers() {
    const toAdd = this.selectedToAdd;
    if (toAdd.length === 0) return;
    this.addingMembers = true;
    try {
      for (const c of toAdd) {
        await this.friendshipService.addMemberToGroup(this.group.id, c.id);
      }
      this.closeAddMember();
      await this.loadMembers();
    } catch (e) {
      console.error('Error adding members:', e);
    }
    this.addingMembers = false;
  }

  // ── Member actions ───────────────────────

  onMemberTap(member: Member) {
    if (member.isMe || !this.canActOn(member)) return;

    const actions: typeof this.memberActionsList = [];

    if (this.isOwner) {
      if (member.role === 'member') {
        actions.push({
          icon: 'shield-checkmark-outline',
          label: this.lang.t('detail_promote_admin'),
          handler: () => this.setMemberRole(member, 'admin'),
        });
      } else if (member.role === 'admin') {
        actions.push({
          icon: 'shield-outline',
          label: this.lang.t('detail_demote_admin'),
          handler: () => this.setMemberRole(member, 'member'),
        });
      }
    }

    actions.push({
      icon: 'person-remove-outline',
      label: this.lang.t('detail_remove_member'),
      destructive: true,
      handler: () => this.confirmRemoveMember(member),
    });

    this.memberActionsTarget = member;
    this.memberActionsList = actions;
    this.showMemberActions = true;
  }

  closeMemberActions() {
    this.showMemberActions = false;
    this.memberActionsTarget = null;
    this.memberActionsList = [];
  }

  runMemberAction(action: { handler: () => void }) {
    this.closeMemberActions();
    action.handler();
  }

  private async setMemberRole(member: Member, role: 'member' | 'admin') {
    try {
      await this.friendshipService.setGroupMemberRole(this.group.id, member.id, role);
      member.role = role;
      this.sortMembers();
    } catch (e) {
      console.error('Error setting role:', e);
    }
  }

  private async confirmRemoveMember(member: Member) {
    const alert = await this.alertCtrl.create({
      header: this.lang.t('detail_remove_confirm_title'),
      message: this.lang.t('detail_remove_confirm_msg'),
      buttons: [
        { text: this.lang.t('chat_cancel'), role: 'cancel' },
        {
          text: this.lang.t('detail_remove_btn'),
          role: 'destructive',
          cssClass: 'alert-danger-btn',
          handler: async () => {
            try {
              await this.friendshipService.removeMemberFromGroup(this.group.id, member.id);
              this.members = this.members.filter(m => m.id !== member.id);
              this.group.memberCount--;
            } catch (e) {
              console.error('Error removing member:', e);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Leave group ──────────────────────────

  async leaveGroup() {
    if (this.isOwner) {
      await this.ownerLeaveFlow();
      return;
    }
    const alert = await this.alertCtrl.create({
      header: this.lang.t('detail_leave_confirm_title'),
      message: this.lang.t('detail_leave_confirm_msg'),
      buttons: [
        { text: this.lang.t('chat_cancel'), role: 'cancel' },
        {
          text: this.lang.t('detail_leave_btn'),
          role: 'destructive',
          cssClass: 'alert-danger-btn',
          handler: async () => {
            try {
              await this.friendshipService.leaveGroup(this.group.id);
              this.router.navigate(['/home']);
            } catch (e) {
              console.error('Error leaving group:', e);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async ownerLeaveFlow() {
    const candidates = this.members.filter(m => !m.isMe);
    if (candidates.length === 0) {
      await this.confirmDeleteGroup();
      return;
    }
    this.transferCandidates = candidates;
    this.transferTarget = null;
    this.showTransferSheet = true;
  }

  closeTransferSheet() {
    this.showTransferSheet = false;
    this.transferCandidates = [];
    this.transferTarget = null;
  }

  selectTransferTarget(member: Member) {
    this.transferTarget = member;
  }

  async confirmTransfer() {
    if (!this.transferTarget || this.transferring) return;
    this.transferring = true;
    try {
      await this.friendshipService.transferGroupOwnership(this.group.id, this.transferTarget.id);
      await this.friendshipService.leaveGroup(this.group.id);
      this.router.navigate(['/home']);
    } catch (e) {
      console.error('Error transferring ownership:', e);
    }
    this.transferring = false;
  }

  // ── Delete group ─────────────────────────

  async deleteGroup() {
    await this.confirmDeleteGroup();
  }

  private async confirmDeleteGroup() {
    const alert = await this.alertCtrl.create({
      header: this.lang.t('detail_delete_group_title'),
      message: this.lang.t('detail_delete_group_msg'),
      buttons: [
        { text: this.lang.t('chat_cancel'), role: 'cancel' },
        {
          text: this.lang.t('detail_delete_group_btn'),
          role: 'destructive',
          cssClass: 'alert-danger-btn',
          handler: async () => {
            try {
              await this.friendshipService.deleteGroup(this.group.id);
              this.router.navigate(['/home']);
            } catch (e) {
              console.error('Error deleting group:', e);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Shared media ─────────────────────────

  async openSharedMedia() {
    this.showMediaViewer = true;
    this.loadingMedia = true;
    this.viewerIndex = -1;
    this.mediaItems = [];
    try {
      const messages = await this.chatService.getGroupMessages(this.group.id);
      this.mediaItems = (messages as any[])
        .filter(m => m.image_url && !m.is_photo_bomb && !m.is_deleted)
        .map(m => ({
          id:       m.id,
          url:      m.image_url,
          type:     this.getFileType(m.image_url),
          filename: this.extractFilename(m.image_url),
          sentAt:   m.created_at,
        }))
        .reverse();
    } catch (e) {
      console.error('Error loading group media:', e);
    }
    this.loadingMedia = false;
    this.mediaGroups = this.buildMediaGroups();
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

  openGroupItem(group: MediaGroup, localIndex: number) {
    const globalIndex = this.mediaItems.findIndex(m => m.id === group.items[localIndex].id);
    this.viewerIndex = globalIndex;
  }

  private buildMediaGroups(): MediaGroup[] {
    const order = ['today', 'yesterday', 'this_week', 'this_month', 'this_year', 'past_years'];
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
    if (d.getFullYear() === now.getFullYear())    return 'this_year';
    return 'past_years';
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

  // ── Helpers ──────────────────────────────

  colorFromId(id: string): string {
    const colors = ['#27ae60', '#2980b9', '#e67e22', '#8e44ad', '#c0392b', '#d35400', '#16a085', '#f39c12'];
    return colors[id.charCodeAt(0) % colors.length];
  }

  goBack() {
    this.location.back();
  }
}
