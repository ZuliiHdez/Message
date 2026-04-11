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
  view_once?: boolean;
  viewed_at?: string | null;
  viewed_by?: string | null;
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
  viewOnceMode = false;
  demoMode = false;
  fullscreenImage: string | null = null;
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
    this.contact.id = params['id'] || '';
    this.contact.name = params['name'] || 'Contacto';
    this.contact.bio = params['bio'] || '';
    this.contact.avatarColor = params['color'] || '#4a6fa5';
    this.contact.photoUrl = params['photo'] || '';
  });

  this.myId = await this.chatService.getCurrentUserId();
  console.log('MY ID:', this.myId);
  console.log('CONTACT ID:', this.contact.id);

  if (!this.demoMode) {
    // Marcarme como online
    await this.chatService.setUserStatus('online');

    // Cargar estado del contacto
    this.contact.status = await this.chatService.getUserStatus(this.contact.id) as any;

    // Suscribirse a cambios de estado del contacto en tiempo real
    this.statusChannel = this.chatService.subscribeToUserStatus(
      this.contact.id,
      (status) => { this.contact.status = status as any; }
    );
  }

  // Cargar mensajes
  await this.loadMessages();

  if (!this.demoMode) {
    // Suscribirse a mensajes en tiempo real
    await this.chatService.subscribeToMessages(this.contact.id, (msg) => {
      const formatted = this.formatMessage(msg);
      this.addMessageToGroups(formatted);
      this.shouldScroll = true;
    });
  }
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
  if (this.demoMode) {
    const fakeMessages: Message[] = [
      {
        id: '1',
        sender_id: this.myId,
        receiver_id: this.contact.id,
        content: 'Hallo 👋',
        image_url: '',
        created_at: new Date().toISOString(),
        isMine: true,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      },
      {
        id: '2',
        sender_id: this.contact.id || 'other-user',
        receiver_id: this.myId,
        content: 'Schau dir das Bild an',
        image_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="%236aa9df"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="24">Normales Foto</text></svg>',
        created_at: new Date().toISOString(),
        isMine: false,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        view_once: false,
        viewed_at: null,
        viewed_by: null,
      },
      {
        id: '3',
        sender_id: this.contact.id || 'other-user',
        receiver_id: this.myId,
        content: 'Dieses Foto nur einmal 👀',
        image_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="%23222222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="24">View Once</text></svg>',
        created_at: new Date().toISOString(),
        isMine: false,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        view_once: true,
        viewed_at: null,
        viewed_by: null,
      }
    ];

    this.messageGroups = this.groupByDate(fakeMessages);
    this.shouldScroll = true;
    return;
  }

  const raw = await this.chatService.getMessages(this.contact.id);
  console.log('MESSAGES:', raw);
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

  const trimmedMessage = this.messageText.trim();
  const hasImage = !!this.selectedImage;

  if (!trimmedMessage && !hasImage) return;

  // View Once nur für Bilder erlauben
  if (this.viewOnceMode && !hasImage) {
    this.viewOnceMode = false;
  }

  this.sending = true;

  try {
    let imageUrl: string | undefined;

    // 🔹 Bild behandeln
    if (this.selectedImage) {
      if (this.demoMode) {
        imageUrl = this.selectedImageUrl;
      } else {
        imageUrl = await this.chatService.uploadImage(this.selectedImage);
      }
    }

    // 🔹 Nur im echten Modus an Supabase senden
    if (!this.demoMode) {
      if (this.viewOnceMode && imageUrl) {
        await this.chatService.sendViewOnceMessage(
          this.contact.id,
          trimmedMessage,
          imageUrl
        );
      } else {
        await this.chatService.sendMessage(
          this.contact.id,
          trimmedMessage,
          imageUrl
        );
      }
    }

    // 🔹 Nachricht nur im Demo-Modus lokal anzeigen
    if (this.demoMode) {
      const newMsg: Message = {
        id: Date.now().toString(),
        sender_id: this.myId,
        receiver_id: this.contact.id,
        content: trimmedMessage,
        image_url: imageUrl || '',
        created_at: new Date().toISOString(),
        isMine: true,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        view_once: this.viewOnceMode && !!imageUrl,
        viewed_at: null,
        viewed_by: null,
      };

      this.addMessageToGroups(newMsg);
    }

    // 🔹 Reset
    this.messageText = '';
    this.removeImage();
    this.shouldScroll = true;
    this.viewOnceMode = false;

  } catch (e) {
    console.error('Error enviando mensaje:', e);
    alert('Nachricht konnte nicht gesendet werden. Schau in die Konsole.');
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
  this.viewOnceMode = false; // 🔥 wichtig!
  if (this.fileInput) this.fileInput.nativeElement.value = '';
}

  openImage(url: string) {
  this.fullscreenImage = url;
}
async openViewOncePhoto(msg: Message) {
  if (msg.isMine) return;

  if (msg.viewed_at) {
    alert('Dieses Foto wurde bereits angesehen.');
    return;
  }

  try {
    this.fullscreenImage = msg.image_url;

    if (!this.demoMode) {
      await this.chatService.markMessageAsViewed(msg.id);
    }

    msg.viewed_at = new Date().toISOString();
    msg.viewed_by = this.myId;
  } catch (e) {
    console.error('Fehler beim Markieren als angesehen:', e);
  }
}
closeFullscreenImage() {
  this.fullscreenImage = null;
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
