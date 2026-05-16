import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ChatService } from '../services/chat.service';
import { BuzzService } from '../services/buzz.service';
import { FriendshipService } from '../services/friendship.service';
import { LanguageService } from '../services/language.service';
import 'emoji-picker-element';

interface GroupMessage {
  id: string;
  sender_id: string;
  group_id: string;
  content: string;
  image_url: string;
  is_photo_bomb?: boolean;
  is_deleted?: boolean;
  created_at: string;
  isMine: boolean;
  time: string;
  senderName: string;
  senderColor: string;
  senderPhoto: string;
  isEdited?: boolean;
}

interface MessageGroup {
  date: string;
  messages: GroupMessage[];
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

@Component({
  selector: 'app-group-chat',
  templateUrl: './group-chat.page.html',
  styleUrls: ['./group-chat.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class GroupChatPage implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;

  @ViewChild('emojiPicker') set emojiPickerRef(el: ElementRef) {
    if (el) {
      el.nativeElement.addEventListener('emoji-click', (e: any) => {
        this.messageText += e.detail.unicode;
        this.showEmojiPicker = false;
      });
    }
  }

  group = { id: '', name: '', color: '#4a9fd4', memberCount: 0 };
  memberNames: string[] = [];

  get memberListText(): string {
    if (!this.memberNames.length) return '';
    const max = 3;
    const shown = this.memberNames.slice(0, max);
    const rest  = this.memberNames.length - max;
    return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
  }

  messageText = '';
  messageGroups: MessageGroup[] = [];
  myId = '';
  members = new Map<string, { name: string; color: string; photo: string }>();
  selectedImages: { file: File; url: string }[] = [];
  showImagePreview = false;
  captionText = '';
  currentPreviewIndex = 0;
  sending = false;

  showEmojiPicker = false;
  isPhotoBomb = false;
  openPhotoBombs = new Set<string>();
  explodedPhotoBombs = new Set<string>();

  activeMenuMsgId: string | null = null;
  editingMsgId: string | null = null;
  editText = '';
  private pressTimer: any = null;

  private shouldScroll = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chatService: ChatService,
    private buzzService: BuzzService,
    private friendshipService: FriendshipService,
    public lang: LanguageService
  ) {}

  async ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.group.id    = params['id']    || '';
      this.group.name  = params['name']  || 'Group';
      this.group.color = params['color'] || '#4a9fd4';
    });
  }

  openDetail() {
    this.router.navigate(['/group-detail'], {
      queryParams: { id: this.group.id, name: this.group.name, color: this.group.color },
    });
  }

  loadingMessages = false;

  async ionViewWillEnter() {
    // Re-read params to ensure group.id is set (page may be cached)
    const params = await firstValueFrom(this.route.queryParams);
    this.group.id    = params['id']    || '';
    this.group.name  = params['name']  || 'Group';
    this.group.color = params['color'] || '#4a9fd4';

    this.messageGroups = [];
    this.loadingMessages = true;
    this.explodedPhotoBombs.clear();
    this.openPhotoBombs.clear();

    this.myId = await this.chatService.getCurrentUserId();
    this.buzzService.activeGroupId = this.group.id;

    const { count, profiles } = await this.friendshipService.getGroupMembers(this.group.id);
    this.group.memberCount = count;
    this.members.clear();
    for (const p of profiles) {
      this.members.set(p.id, {
        name: p.full_name || p.username || 'Member',
        color: this.colorFromId(p.id),
        photo: p.avatar_url || '',
      });
    }
    this.memberNames = profiles
      .filter(p => p.id !== this.myId)
      .map(p => p.full_name || p.username || 'Member');

    await this.loadMessages();
    await this.resolveMissingSenders();

    this.chatService.subscribeToGroupMessages(
      this.group.id,
      async (msg) => {
        if (msg.sender_id === this.myId) return;
        if (!this.members.has(msg.sender_id)) {
          const name = await this.friendshipService.getProfileName(msg.sender_id);
          this.members.set(msg.sender_id, {
            name: name || 'Member',
            color: this.colorFromId(msg.sender_id),
            photo: '',
          });
        }
        const formatted = this.formatMessage(msg);
        this.addToGroups(formatted);
        this.shouldScroll = true;
      },
      (msg) => this.updateMessageInGroups(msg),
      (id)  => this.deleteMessageFromGroups(id)
    );
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ionViewWillLeave() {
    this.buzzService.activeGroupId = '';
    this.chatService.unsubscribe();
  }

  ngOnDestroy() {
    this.chatService.unsubscribe();
  }

  private async resolveMissingSenders() {
    const unknownIds = new Set<string>();
    for (const g of this.messageGroups) {
      for (const msg of g.messages) {
        if (!msg.isMine && msg.senderName === 'Member') unknownIds.add(msg.sender_id);
      }
    }
    for (const id of unknownIds) {
      const name = await this.friendshipService.getProfileName(id);
      if (name) {
        const entry = this.members.get(id) ?? { name, color: this.colorFromId(id), photo: '' };
        entry.name = name;
        this.members.set(id, entry);
        for (const g of this.messageGroups) {
          for (const msg of g.messages) {
            if (msg.sender_id === id) msg.senderName = name;
          }
        }
      }
    }
  }

  async loadMessages() {
    this.loadingMessages = true;
    const raw = await this.chatService.getGroupMessages(this.group.id);
    const formatted = raw.map((m: any) => this.formatMessage(m));
    for (const msg of formatted) {
      if (msg.is_photo_bomb && !msg.isMine && !msg.image_url) {
        this.explodedPhotoBombs.add(msg.id);
      }
    }
    this.messageGroups = this.groupByDate(formatted);
    this.loadingMessages = false;
    this.shouldScroll = true;
  }

  formatMessage(msg: any): GroupMessage {
    const date = new Date(msg.created_at);
    const sender = this.members.get(msg.sender_id);
    return {
      ...msg,
      isMine: msg.sender_id === this.myId,
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      senderName: sender?.name || 'User',
      senderColor: sender?.color || '#4a9fd4',
      senderPhoto: sender?.photo || '',
    };
  }

  groupByDate(messages: GroupMessage[]): MessageGroup[] {
    const groups: { [key: string]: GroupMessage[] } = {};
    for (const msg of messages) {
      const key = this.getDateLabel(msg.created_at);
      if (!groups[key]) groups[key] = [];
      groups[key].push(msg);
    }
    return Object.entries(groups).map(([date, msgs]) => ({ date, messages: msgs }));
  }

  getDateLabel(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return this.lang.t('chat_date_today');
    if (date.toDateString() === yesterday.toDateString()) return this.lang.t('chat_date_yesterday');
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  updateMessageInGroups(raw: any) {
    for (const group of this.messageGroups) {
      const msg = group.messages.find(m => m.id === raw.id);
      if (msg) {
        if (raw.is_deleted) {
          msg.is_deleted = true;
          msg.content = '';
          msg.image_url = '';
        } else {
          msg.image_url = raw.image_url ?? '';
          if (raw.content !== undefined) msg.content = raw.content;
        }
        break;
      }
    }
  }

  deleteMessageFromGroups(id: string) {
    for (const group of this.messageGroups) {
      const msg = group.messages.find(m => m.id === id);
      if (msg) {
        msg.is_deleted = true;
        msg.content = '';
        msg.image_url = '';
        break;
      }
    }
  }

  async downloadImage(url: string) {
    const res  = await fetch(url);
    const blob = await res.blob();
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'image.jpg';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  addToGroups(msg: GroupMessage) {
    const label = this.getDateLabel(msg.created_at);
    const last = this.messageGroups[this.messageGroups.length - 1];
    if (last && last.date === label) {
      last.messages.push(msg);
    } else {
      this.messageGroups.push({ date: label, messages: [msg] });
    }
  }

  async sendMessage() {
    if (this.sending) return;
    if (!this.messageText.trim()) return;

    this.sending = true;
    try {
      await this.chatService.sendGroupMessage(this.group.id, this.messageText.trim(), undefined, false);
      const newMsg: GroupMessage = {
        id: Date.now().toString(),
        sender_id: this.myId,
        group_id: this.group.id,
        content: this.messageText.trim(),
        image_url: '',
        is_photo_bomb: false,
        created_at: new Date().toISOString(),
        isMine: true,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        senderName: 'You',
        senderColor: '',
        senderPhoto: '',
      };
      this.addToGroups(newMsg);
      this.messageText = '';
      this.shouldScroll = true;
    } catch (e) {
      console.error('Error sending group message:', e);
    } finally {
      this.sending = false;
    }
  }

  pickImage() {
    this.showEmojiPicker = false;
    this.fileInput.nativeElement.click();
  }

  onImageSelected(event: any) {
    const files = Array.from(event.target.files) as File[];
    if (!files.length) return;
    if (this.fileInput) this.fileInput.nativeElement.value = '';
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (e: any) => { this.selectedImages.push({ file, url: e.target.result }); };
      reader.readAsDataURL(file);
    }
    this.showImagePreview = true;
  }

  addMoreImages() {
    this.fileInput.nativeElement.click();
  }

  removeSelectedImage(index: number) {
    this.selectedImages.splice(index, 1);
    if (this.selectedImages.length === 0) { this.cancelImagePreview(); return; }
    if (this.currentPreviewIndex >= this.selectedImages.length) {
      this.currentPreviewIndex = this.selectedImages.length - 1;
    }
    if (this.selectedImages.length > 1) this.isPhotoBomb = false;
  }

  cancelImagePreview() {
    this.selectedImages = [];
    this.showImagePreview = false;
    this.isPhotoBomb = false;
    this.captionText = '';
    this.currentPreviewIndex = 0;
  }

  get canPhotoBomb(): boolean {
    return this.selectedImages.length === 1;
  }

  async sendFromPreview() {
    if (!this.selectedImages.length || this.sending) return;
    this.sending = true;
    const images = [...this.selectedImages];
    const caption = this.captionText;
    const isPhotoBomb = this.canPhotoBomb && this.isPhotoBomb;
    this.cancelImagePreview();
    try {
      for (let i = 0; i < images.length; i++) {
        const imageUrl = await this.chatService.uploadImage(images[i].file);
        const text = i === 0 ? caption : '';
        await this.chatService.sendGroupMessage(this.group.id, text, imageUrl, isPhotoBomb);
        const newMsg: GroupMessage = {
          id: Date.now().toString() + i,
          sender_id: this.myId,
          group_id: this.group.id,
          content: text,
          image_url: imageUrl,
          is_photo_bomb: isPhotoBomb,
          created_at: new Date().toISOString(),
          isMine: true,
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          senderName: 'You',
          senderColor: '',
          senderPhoto: '',
        };
        this.addToGroups(newMsg);
      }
      this.shouldScroll = true;
    } catch (e) {
      console.error('Error sending group message:', e);
    } finally {
      this.sending = false;
    }
  }


  toggleEmoji() {
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  closeEmoji() {
    this.showEmojiPicker = false;
  }

  viewerUrl    = '';
  viewerIsBomb = false;
  viewerBombId = '';

  openImage(url: string) {
    this.viewerUrl    = url;
    this.viewerIsBomb = false;
  }

  viewPhotoBomb(msgId: string, url: string) {
    if (this.explodedPhotoBombs.has(msgId)) return;
    this.viewerBombId = msgId;
    this.viewerUrl    = url;
    this.viewerIsBomb = true;
    this.openPhotoBombs.add(msgId);
  }

  closeViewer() {
    if (this.viewerIsBomb) {
      const msgId = this.viewerBombId;
      this.explodedPhotoBombs.add(msgId);
      this.openPhotoBombs.delete(msgId);
      this.viewerBombId = '';
      this.chatService.clearPhotoBombImage(msgId).catch(() => {});
    }
    this.viewerUrl    = '';
    this.viewerIsBomb = false;
  }

  scrollToBottom() {
    try {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    } catch {}
  }

  canEdit(msg: GroupMessage): boolean {
    if (!msg.isMine || msg.is_photo_bomb || msg.is_deleted) return false;
    if (!msg.content || !!msg.image_url) return false; // text-only messages only

    // Time window: 15 minutes from creation
    if (Date.now() - new Date(msg.created_at).getTime() > EDIT_WINDOW_MS) return false;

    const all: GroupMessage[] = this.messageGroups.reduce((acc: GroupMessage[], g) => acc.concat(g.messages), []);

    // Only the most recent message sent by me
    const lastOwn = [...all].reverse().find((m: GroupMessage) => m.isMine && !m.is_photo_bomb);
    if (lastOwn?.id !== msg.id) return false;

    // Not if any other member has sent a message after this one (considered read)
    const msgTime = new Date(msg.created_at).getTime();
    if (all.some((m: GroupMessage) => !m.isMine && new Date(m.created_at).getTime() > msgTime)) return false;

    return true;
  }

  onPressStart(msg: GroupMessage) {
    if (!msg.isMine || msg.is_deleted) return;
    this.pressTimer = setTimeout(() => { this.activeMenuMsgId = msg.id; }, 500);
  }

  onPressEnd() {
    if (this.pressTimer) { clearTimeout(this.pressTimer); this.pressTimer = null; }
  }

  hideMenu() { this.activeMenuMsgId = null; }

  startEdit(msg: GroupMessage) {
    if (!this.canEdit(msg)) return;
    this.activeMenuMsgId = null;
    this.editingMsgId = msg.id;
    this.editText = msg.content;
  }

  cancelEdit() {
    this.editingMsgId = null;
    this.editText = '';
  }

  async saveEdit(msg: GroupMessage) {
    const newContent = this.editText.trim();
    if (!newContent || newContent === msg.content) { this.cancelEdit(); return; }
    msg.content = newContent;
    msg.isEdited = true;
    this.editingMsgId = null;
    this.editText = '';
    try { await this.chatService.updateGroupMessage(msg.id, newContent); } catch (e) { console.error(e); }
  }

  async deleteMsg(msg: GroupMessage) {
    this.activeMenuMsgId = null;
    msg.is_deleted = true;
    msg.content = '';
    msg.image_url = '';
    try { await this.chatService.deleteGroupMessage(msg.id); } catch (e) { console.error(e); }
  }

  goBack() {
    this.router.navigate(['/home']);
  }

  private colorFromId(id: string): string {
    const colors = ['#27ae60', '#2980b9', '#e67e22', '#8e44ad', '#c0392b', '#d35400', '#16a085', '#f39c12'];
    return colors[id.charCodeAt(0) % colors.length];
  }
}
