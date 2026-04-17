import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class ChatService {

  private channel: RealtimeChannel | null = null;
  private statusChannels = new Map<string, RealtimeChannel>();

  constructor(private supabase: SupabaseService) {}

  private get db() { return this.supabase.getClient(); }

  async getCurrentUserId(): Promise<string> {
    const { data } = await this.db.auth.getSession();
    return data.session?.user.id || '';
  }

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

  subscribeToMessages(otherUserId: string, callback: (msg: any) => void) {
    this.unsubscribe();
    this.channel = this.db
      .channel(`chat-${otherUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => {
          const msg = payload.new;
          if (msg.sender_id === otherUserId || msg.receiver_id === otherUserId) {
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

  async getGroupMessages(groupId: string) {
    const { data, error } = await this.db
      .from('messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async sendGroupMessage(groupId: string, content: string, imageUrl?: string) {
    const myId = await this.getCurrentUserId();
    const { error } = await this.db
      .from('messages')
      .insert({
        sender_id: myId,
        group_id: groupId,
        content: content || null,
        image_url: imageUrl || null,
      });
    if (error) throw error;
  }

  subscribeToGroupMessages(groupId: string, callback: (msg: any) => void) {
    this.unsubscribe();
    this.channel = this.db
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
        (payload: any) => callback(payload.new)
      )
      .subscribe();
  }

  async setUserStatus(status: 'online' | 'away' | 'busy' | 'offline') {
    const myId = await this.getCurrentUserId();
    if (!myId) return;
    await this.db
      .from('profiles')
      .update({ user_status: status, last_seen: new Date().toISOString() })
      .eq('id', myId);
  }

  subscribeToUserStatus(userId: string, callback: (status: string) => void) {
    const existing = this.statusChannels.get(userId);
    if (existing) {
      this.db.removeChannel(existing);
      this.statusChannels.delete(userId);
    }
    const ch = this.db
      .channel(`status-${userId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload: any) => callback(payload.new['user_status'])
      )
      .subscribe();
    this.statusChannels.set(userId, ch);
    return ch;
  }

  unsubscribeStatusChannels() {
    this.statusChannels.forEach(ch => this.db.removeChannel(ch));
    this.statusChannels.clear();
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
