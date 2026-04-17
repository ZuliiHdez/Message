import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatService } from '../services/chat.service';
import { FriendshipService } from '../services/friendship.service';
import 'emoji-picker-element';

interface GroupMessage {
  id: string;
  sender_id: string;
  group_id: string;
  content: string;
  image_url: string;
  is_photo_bomb?: boolean;
  created_at: string;
  isMine: boolean;
  time: string;
  senderName: string;
  senderColor: string;
  senderPhoto: string;
}

interface MessageGroup {
  date: string;
  messages: GroupMessage[];
}

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

  messageText = '';
  messageGroups: MessageGroup[] = [];
  myId = '';
  members = new Map<string, { name: string; color: string; photo: string }>();
  selectedImage: File | null = null;
  selectedImageUrl = '';
  sending = false;

  showEmojiPicker = false;
  isPhotoBomb = false;
  pendingFile: File | null = null;
  showImageTypeDialog = false;
  openPhotoBombs = new Set<string>();
  explodedPhotoBombs = new Set<string>();

  private shouldScroll = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chatService: ChatService,
    private friendshipService: FriendshipService,
  ) {}

  async ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.group.id    = params['id']    || '';
      this.group.name  = params['name']  || 'Group';
      this.group.color = params['color'] || '#4a9fd4';
    });
  }

  loadingMessages = false;

  async ionViewWillEnter() {
    // Limpiar mensajes del chat anterior inmediatamente
    this.messageGroups = [];
    this.loadingMessages = true;
    this.explodedPhotoBombs.clear();
    this.openPhotoBombs.clear();

    // Siempre refrescar myId por si cambió la sesión
    this.myId = await this.chatService.getCurrentUserId();

    const profiles = await this.friendshipService.getGroupMembers(this.group.id);
    this.group.memberCount = profiles.length;
    this.members.clear();
    for (const p of profiles) {
      this.members.set(p.id, {
        name: p.full_name || p.username || 'Usuario',
        color: this.colorFromId(p.id),
        photo: p.avatar_url || '',
      });
    }

    await this.loadMessages();

    this.chatService.subscribeToGroupMessages(
      this.group.id,
      (msg) => {
        if (msg.sender_id === this.myId) return;
        const formatted = this.formatMessage(msg);
        this.addToGroups(formatted);
        this.shouldScroll = true;
      },
      (msg) => this.updateMessageInGroups(msg)
    );
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ionViewWillLeave() {
    this.chatService.unsubscribe();
  }

  ngOnDestroy() {
    this.chatService.unsubscribe();
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
      time: date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      senderName: sender?.name || 'Usuario',
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
    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  updateMessageInGroups(raw: any) {
    for (const group of this.messageGroups) {
      const msg = group.messages.find(m => m.id === raw.id);
      if (msg) { msg.image_url = raw.image_url ?? ''; break; }
    }
  }

  async downloadImage(url: string) {
    const res  = await fetch(url);
    const blob = await res.blob();
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'imagen.jpg';
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
    if (!this.messageText.trim() && !this.selectedImage) return;

    this.sending = true;
    try {
      let imageUrl: string | undefined;
      if (this.selectedImage) {
        imageUrl = await this.chatService.uploadImage(this.selectedImage);
      }

      await this.chatService.sendGroupMessage(
        this.group.id,
        this.messageText.trim(),
        imageUrl,
        this.isPhotoBomb
      );

      const newMsg: GroupMessage = {
        id: Date.now().toString(),
        sender_id: this.myId,
        group_id: this.group.id,
        content: this.messageText.trim(),
        image_url: imageUrl || '',
        is_photo_bomb: this.isPhotoBomb,
        created_at: new Date().toISOString(),
        isMine: true,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        senderName: 'Tú',
        senderColor: '',
        senderPhoto: '',
      };
      this.addToGroups(newMsg);
      this.messageText = '';
      this.removeImage();
      this.shouldScroll = true;
    } catch (e) {
      console.error('Error enviando mensaje de grupo:', e);
    } finally {
      this.sending = false;
    }
  }

  pickImage() {
    this.showEmojiPicker = false;
    this.fileInput.nativeElement.click();
  }

  onImageSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.pendingFile = file;
    this.showImageTypeDialog = true;
    if (this.fileInput) this.fileInput.nativeElement.value = '';
  }

  selectImageType(bomb: boolean) {
    this.showImageTypeDialog = false;
    if (!this.pendingFile) return;
    this.isPhotoBomb = bomb;
    this.selectedImage = this.pendingFile;
    this.pendingFile = null;
    const reader = new FileReader();
    reader.onload = (e: any) => { this.selectedImageUrl = e.target.result; };
    reader.readAsDataURL(this.selectedImage);
  }

  cancelImageSelection() {
    this.showImageTypeDialog = false;
    this.pendingFile = null;
  }

  removeImage() {
    this.selectedImage = null;
    this.selectedImageUrl = '';
    this.isPhotoBomb = false;
    if (this.fileInput) this.fileInput.nativeElement.value = '';
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

  goBack() {
    this.router.navigate(['/home']);
  }

  private colorFromId(id: string): string {
    const colors = ['#27ae60', '#2980b9', '#e67e22', '#8e44ad', '#c0392b', '#d35400', '#16a085', '#f39c12'];
    return colors[id.charCodeAt(0) % colors.length];
  }
}
