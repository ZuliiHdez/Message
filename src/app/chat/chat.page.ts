import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ChatService } from '../services/chat.service';
import { BuzzService } from '../services/buzz.service';
import { LanguageService } from '../services/language.service';
import 'emoji-picker-element';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  image_url: string;
  is_photo_bomb?: boolean;
  is_deleted?: boolean;
  created_at: string;
  isMine: boolean;
  time: string;
  isEdited?: boolean;
}

interface MessageGroup {
  date: string;
  messages: Message[];
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

@Component({
  selector: 'app-chat',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ChatPage implements OnInit, OnDestroy, AfterViewChecked {

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

  contact = {
    id: '',
    name: '',
    bio: '',
    status: 'offline' as 'online' | 'away' | 'busy' | 'offline',
    avatarColor: '#4a6fa5',
    photoUrl: '',
  };

  messageText = '';
  messageGroups: MessageGroup[] = [];
  myId = '';
  isTyping = false;
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

  buzzCooldown = 0;
  isBuzzShaking = false;
  private buzzCountTimer: any = null;
  private buzzSub: Subscription | null = null;

  private shouldScroll = false;
  private statusChannel: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chatService: ChatService,
    public buzzService: BuzzService,
    public lang: LanguageService
  ) {}

  async ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.contact.id          = params['id']    || '';
      this.contact.name        = params['name']  || 'Contacto';
      this.contact.bio         = params['bio']   || '';
      this.contact.avatarColor = params['color'] || '#4a6fa5';
      this.contact.photoUrl    = params['photo'] || '';
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
    this.buzzService.activeChatContactId = this.contact.id;
    const savedStatus = localStorage.getItem('lastUserAvailability') as any;
    await this.chatService.setUserStatus(savedStatus || 'online');
    this.contact.status = await this.chatService.getUserStatus(this.contact.id) as any;

    if (this.statusChannel) {
      this.chatService['db']?.removeChannel(this.statusChannel);
    }
    this.statusChannel = this.chatService.subscribeToUserStatus(
      this.contact.id,
      (status) => { this.contact.status = status as any; }
    );

    await this.loadMessages();

    this.chatService.subscribeToMessages(
      this.myId, this.contact.id,
      (msg) => {
        const formatted = this.formatMessage(msg);
        this.addMessageToGroups(formatted);
        this.shouldScroll = true;
      },
      (msg) => this.updateMessageInGroups(msg),
      (id)  => this.deleteMessageFromGroups(id)
    );

    // Shake when AppComponent delivers a buzz from this contact
    this.buzzSub = this.buzzService.buzz$.subscribe(({ from }) => {
      if (from === this.contact.id) this.triggerShake();
    });
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ionViewWillLeave() {
    this.buzzService.activeChatContactId = '';
    this.chatService.unsubscribe();
    if (this.buzzCountTimer) { clearInterval(this.buzzCountTimer); this.buzzCountTimer = null; }
    if (this.buzzSub) { this.buzzSub.unsubscribe(); this.buzzSub = null; }
  }

  ngOnDestroy() {
    this.chatService.unsubscribe();
    if (this.statusChannel) {
      this.chatService['db']?.removeChannel(this.statusChannel);
    }
    if (this.buzzCountTimer) { clearInterval(this.buzzCountTimer); this.buzzCountTimer = null; }
    if (this.buzzSub) { this.buzzSub.unsubscribe(); this.buzzSub = null; }
  }

  async loadMessages() {
    this.loadingMessages = true;
    const raw = await this.chatService.getMessages(this.contact.id);
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

  formatMessage(msg: any): Message {
    const date = new Date(msg.created_at);
    return {
      ...msg,
      isMine: msg.sender_id === this.myId,
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  }

  groupByDate(messages: Message[]): MessageGroup[] {
    const groups: { [key: string]: Message[] } = {};
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
    a.download = 'imagen.jpg';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  addMessageToGroups(msg: Message) {
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
      await this.chatService.sendMessage(this.contact.id, this.messageText.trim(), undefined, false);
      const newMsg: Message = {
        id: Date.now().toString(),
        sender_id: this.myId,
        receiver_id: this.contact.id,
        content: this.messageText.trim(),
        image_url: '',
        is_photo_bomb: false,
        created_at: new Date().toISOString(),
        isMine: true,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      this.addMessageToGroups(newMsg);
      this.messageText = '';
      this.shouldScroll = true;
    } catch (e) {
      console.error('Error sending message:', e);
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
        await this.chatService.sendMessage(this.contact.id, text, imageUrl, isPhotoBomb);
        const newMsg: Message = {
          id: Date.now().toString() + i,
          sender_id: this.myId,
          receiver_id: this.contact.id,
          content: text,
          image_url: imageUrl,
          is_photo_bomb: isPhotoBomb,
          created_at: new Date().toISOString(),
          isMine: true,
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        };
        this.addMessageToGroups(newMsg);
      }
      this.shouldScroll = true;
    } catch (e) {
      console.error('Error sending message:', e);
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

  getStatusLabel(status: string): string {
    const map: any = {
      online:  this.lang.t('status_online'),
      away:    this.lang.t('status_away'),
      busy:    this.lang.t('status_busy'),
      offline: this.lang.t('status_offline'),
    };
    return map[status] || this.lang.t('status_offline');
  }

  scrollToBottom() {
    try {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    } catch {}
  }

  canEdit(msg: Message): boolean {
    if (!msg.isMine || msg.is_photo_bomb || msg.is_deleted) return false;
    if (!msg.content || !!msg.image_url) return false; // text-only messages only

    // Time window: 15 minutes from creation
    if (Date.now() - new Date(msg.created_at).getTime() > EDIT_WINDOW_MS) return false;

    const all: Message[] = this.messageGroups.reduce((acc: Message[], g) => acc.concat(g.messages), []);

    // Only the most recent message sent by me
    const lastOwn = [...all].reverse().find((m: Message) => m.isMine && !m.is_photo_bomb);
    if (lastOwn?.id !== msg.id) return false;

    // Not if the contact has replied after this message (considered read)
    const msgTime = new Date(msg.created_at).getTime();
    if (all.some((m: Message) => !m.isMine && new Date(m.created_at).getTime() > msgTime)) return false;

    return true;
  }

  onPressStart(msg: Message) {
    if (!msg.isMine || msg.is_deleted) return;
    this.pressTimer = setTimeout(() => { this.activeMenuMsgId = msg.id; }, 500);
  }

  onPressEnd() {
    if (this.pressTimer) { clearTimeout(this.pressTimer); this.pressTimer = null; }
  }

  hideMenu() { this.activeMenuMsgId = null; }

  startEdit(msg: Message) {
    if (!this.canEdit(msg)) return;
    this.activeMenuMsgId = null;
    this.editingMsgId = msg.id;
    this.editText = msg.content;
  }

  cancelEdit() {
    this.editingMsgId = null;
    this.editText = '';
  }

  async saveEdit(msg: Message) {
    const newContent = this.editText.trim();
    if (!newContent || newContent === msg.content) { this.cancelEdit(); return; }
    msg.content = newContent;
    msg.isEdited = true;
    this.editingMsgId = null;
    this.editText = '';
    try { await this.chatService.updateMessage(msg.id, newContent); } catch (e) { console.error(e); }
  }

  async deleteMsg(msg: Message) {
    this.activeMenuMsgId = null;
    msg.is_deleted = true;
    msg.content = '';
    msg.image_url = '';
    try { await this.chatService.deleteMessage(msg.id); } catch (e) { console.error(e); }
  }

  async sendBuzz() {
    if (!this.buzzService.canBuzz(this.contact.id)) return;
    this.buzzService.recordBuzz(this.contact.id);
    this.startBuzzCooldown();
    const myName = (JSON.parse(localStorage.getItem('lastUser') || '{}') as any)?.name || '';
    await Promise.all([
      this.chatService.sendGlobalBuzz(this.contact.id, this.myId, myName),
      this.buzzService.play(),
    ]);
    this.triggerShake();
  }

  triggerShake() {
    this.isBuzzShaking = false;
    setTimeout(() => {
      this.isBuzzShaking = true;
      setTimeout(() => { this.isBuzzShaking = false; }, 640);
    }, 20);
  }

  startBuzzCooldown() {
    this.buzzCooldown = Math.ceil(this.buzzService.cooldownRemaining(this.contact.id) / 1000);
    if (this.buzzCountTimer) clearInterval(this.buzzCountTimer);
    this.buzzCountTimer = setInterval(() => {
      this.buzzCooldown = Math.ceil(this.buzzService.cooldownRemaining(this.contact.id) / 1000);
      if (this.buzzCooldown <= 0) {
        clearInterval(this.buzzCountTimer);
        this.buzzCountTimer = null;
      }
    }, 500);
  }

  openOptions() {}

  goBack() {
    this.router.navigate(['/home']);
  }

  openDetail() {
    this.router.navigate(['/contact-detail'], {
      queryParams: {
        id:     this.contact.id,
        name:   this.contact.name,
        bio:    this.contact.bio,
        color:  this.contact.avatarColor,
        photo:  this.contact.photoUrl,
        status: this.contact.status,
      },
    });
  }
}
