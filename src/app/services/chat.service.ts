// chat.service.ts
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class ChatService {

  private channel: RealtimeChannel | null = null;

  constructor(private supabase: SupabaseService) {}

  private get db() { return this.supabase.getClient(); }

  async getCurrentUserId(): Promise<string> {
    const { data } = await this.db.auth.getSession();
    return data.session?.user.id || '';
  }

  // ── Mensajes ───────────────────────────────────────────────

  async getMessages(otherUserId: string) {
    const myId = await this.getCurrentUserId();
    const { data, error } = await this.db
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${myId},receiver_id.eq.${otherUserId}),` +
        `and(sender_id.eq.${otherUserId},receiver_id.eq.${myId})`
      )
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async sendMessage(receiverId: string, content: string, imageUrl?: string) {
    const myId = await this.getCurrentUserId();
    const { error } = await this.db
      .from('messages')
      .insert({
        sender_id: myId,
        receiver_id: receiverId,
        content: content || null,
        image_url: imageUrl || null,
      });

    if (error) throw error;
  }

  async uploadImage(file: File): Promise<string> {
    const myId = await this.getCurrentUserId();
    const ext = file.name.split('.').pop();
    const path = `${myId}/${Date.now()}.${ext}`;

    const { error } = await this.db.storage
      .from('chat-images')
      .upload(path, file);

    if (error) throw error;

    const { data } = this.db.storage
      .from('chat-images')
      .getPublicUrl(path);

    return data.publicUrl;
  }

  // ── Realtime ───────────────────────────────────────────────

  subscribeToMessages(otherUserId: string, callback: (msg: any) => void) {
    this.unsubscribe();
    this.channel = this.db
      .channel(`chat-${otherUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => {
          const msg = payload.new;
          // Solo notificar si pertenece a esta conversación
          if (
            (msg.sender_id === otherUserId) ||
            (msg.receiver_id === otherUserId)
          ) {
            callback(msg);
          }
        }
      )
      .subscribe();
  }

  unsubscribe() {
    if (this.channel) {
      this.db.removeChannel(this.channel);
      this.channel = null;
    }
  }

  // ── Estado del usuario ────────────────────────────────────

  async setUserStatus(status: 'online' | 'away' | 'busy' | 'offline') {
    const myId = await this.getCurrentUserId();
    await this.db
      .from('profiles')
      .update({ user_status: status, last_seen: new Date().toISOString() })
      .eq('id', myId);
  }

  subscribeToUserStatus(userId: string, callback: (status: string) => void) {
    return this.db
      .channel(`status-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload: any) => callback(payload.new['user_status'])
      )
      .subscribe();
  }

  // Suscribirse al estado de varios contactos a la vez (para el home)
  // Antes de notificar, verifica en auth.sessions que el usuario sigue conectado
  subscribeToContactsStatus(
    contactIds: string[],
    callback: (userId: string, status: string) => void
  ) {
    return this.db
      .channel('contacts-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        async (payload: any) => {
          const userId: string = payload.new.id;
          if (!contactIds.includes(userId)) return;

          const hasSession = await this.hasActiveSession(userId);
          callback(userId, hasSession ? (payload.new.user_status || 'offline') : 'offline');
        }
      )
      .subscribe();
  }

  async hasActiveSession(userId: string): Promise<boolean> {
    const admin = this.supabase.getAdminClient();
    const { data } = await (admin as any)
      .schema('auth')
      .from('sessions')
      .select('user_id')
      .eq('user_id', userId)
      .or(`not_after.is.null,not_after.gt.${new Date().toISOString()}`)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  unsubscribeContactsStatus(channel: any) {
    if (channel) this.db.removeChannel(channel);
  }

  async getUserStatus(userId: string): Promise<string> {
    const { data } = await this.db
      .from('profiles')
      .select('user_status')
      .eq('id', userId)
      .single();
    return data?.user_status || 'offline';
  }
}
