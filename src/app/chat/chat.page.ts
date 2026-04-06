// chat.page.ts
import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatService } from '../services/chat.service';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  image_url: string;
  created_at: string;
  isMine: boolean;
  time: string;
}

interface MessageGroup {
  date: string;
  messages: Message[];
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ChatPage implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;

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
  selectedImage: File | null = null;
  selectedImageUrl = '';
  sending = false;
  private shouldScroll = false;
  private statusChannel: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chatService: ChatService
  ) {}

  async ngOnInit() {
    // Leer datos del contacto desde query params
    this.route.queryParams.subscribe(params => {
      this.contact.id        = params['id']         || '';
      this.contact.name      = params['name']       || 'Contacto';
      this.contact.bio       = params['bio']        || '';
      this.contact.avatarColor = params['color']   || '#4a6fa5';
      this.contact.photoUrl  = params['photo']      || '';
    });

    this.myId = await this.chatService.getCurrentUserId();

    // Marcarme como online
    await this.chatService.setUserStatus('online');

    // Cargar estado del contacto
    this.contact.status = await this.chatService.getUserStatus(this.contact.id) as any;

    // Suscribirse a cambios de estado del contacto en tiempo real
    this.statusChannel = this.chatService.subscribeToUserStatus(
      this.contact.id,
      (status) => { this.contact.status = status as any; }
    );

    // Cargar mensajes
    await this.loadMessages();

    // Suscribirse a mensajes en tiempo real (solo del otro usuario, los propios ya se añaden en sendMessage)
    this.chatService.subscribeToMessages(this.contact.id, (msg) => {
      if (msg.sender_id === this.myId) return;
      const formatted = this.formatMessage(msg);
      this.addMessageToGroups(formatted);
      this.shouldScroll = true;
    });
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ngOnDestroy() {
    this.chatService.unsubscribe();
    if (this.statusChannel) {
      this.chatService['db']?.removeChannel(this.statusChannel);
    }
  }

  async loadMessages() {
    const raw = await this.chatService.getMessages(this.contact.id);
    const formatted = raw.map((m: any) => this.formatMessage(m));
    this.messageGroups = this.groupByDate(formatted);
    this.shouldScroll = true;
  }

  formatMessage(msg: any): Message {
    const date = new Date(msg.created_at);
    return {
      ...msg,
      isMine: msg.sender_id === this.myId,
      time: date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
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

    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
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
    if (!this.messageText.trim() && !this.selectedImage) return;

    this.sending = true;
    try {
      let imageUrl: string | undefined;

      if (this.selectedImage) {
        imageUrl = await this.chatService.uploadImage(this.selectedImage);
      }

      await this.chatService.sendMessage(
        this.contact.id,
        this.messageText.trim(),
        imageUrl
      );

      // Añadir mensaje propio inmediatamente
      const newMsg: Message = {
        id: Date.now().toString(),
        sender_id: this.myId,
        receiver_id: this.contact.id,
        content: this.messageText.trim(),
        image_url: imageUrl || '',
        created_at: new Date().toISOString(),
        isMine: true,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      };
      this.addMessageToGroups(newMsg);
      this.messageText = '';
      this.removeImage();
      this.shouldScroll = true;
    } catch (e) {
      console.error('Error enviando mensaje:', e);
    } finally {
      this.sending = false;
    }
  }

  // ── Imagen ─────────────────────────────────────────────────

  pickImage() {
    this.fileInput.nativeElement.click();
  }

  onImageSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.selectedImage = file;
    const reader = new FileReader();
    reader.onload = (e: any) => { this.selectedImageUrl = e.target.result; };
    reader.readAsDataURL(file);
  }

  removeImage() {
    this.selectedImage = null;
    this.selectedImageUrl = '';
    if (this.fileInput) this.fileInput.nativeElement.value = '';
  }

  openImage(url: string) {
    window.open(url, '_blank');
  }

  // ── UI ─────────────────────────────────────────────────────

  getStatusLabel(status: string): string {
    const map: any = {
      online: 'En línea',
      away: 'Ausente',
      busy: 'Ocupado',
      offline: 'Desconectado'
    };
    return map[status] || 'Desconectado';
  }

  scrollToBottom() {
    try {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    } catch {}
  }

  toggleEmoji() {
    // TODO: integrar selector de emojis (ej: emoji-mart)
    console.log('Abrir selector de emojis');
  }

  openOptions() {
    console.log('Abrir opciones');
  }

  goBack() {
    this.router.navigate(['/home']);
  }
}
