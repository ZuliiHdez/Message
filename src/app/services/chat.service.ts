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

  async sendMessage(receiverId: string, content: string, imageUrl?: string, isPhotoBomb = false) {
    const myId = await this.getCurrentUserId();
    const { error } = await this.db
      .from('messages')
      .insert({
        sender_id: myId,
        receiver_id: receiverId,
        content: content || null,
        image_url: imageUrl || null,
        is_photo_bomb: isPhotoBomb,
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

  private dmChannelId(a: string, b: string): string {
    return `dm-${[a, b].sort().join('-')}`;
  }

  subscribeToMessages(
    myId: string,
    otherUserId: string,
    onInsert: (msg: any) => void,
    onUpdate: (msg: any) => void = () => {},
    onDelete: (id: string) => void = () => {},
    onBuzz: () => void = () => {}
  ) {
    this.unsubscribe();
    this.channel = this.db
      .channel(this.dmChannelId(myId, otherUserId))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${myId}` },
        (payload: any) => {
          const msg = payload.new;
          if (msg.sender_id === otherUserId) onInsert(msg);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${myId}` },
        (payload: any) => onUpdate(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${myId}` },
        (payload: any) => {
          if (payload.new.sender_id === otherUserId) onUpdate(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload: any) => { if (payload.old?.id) onDelete(payload.old.id); }
      )
      .on('broadcast', { event: 'buzz' },
        (payload: any) => { if (payload.payload?.from === otherUserId) onBuzz(); }
      )
      .subscribe();
  }

  async sendBuzz(myId: string): Promise<void> {
    if (!this.channel) return;
    await this.channel.send({
      type: 'broadcast',
      event: 'buzz',
      payload: { from: myId },
    });
  }

  unsubscribe() {
    if (this.channel) {
      this.db.removeChannel(this.channel);
      this.channel = null;
    }
  }

  async getGroupMessages(groupId: string) {
    const { data, error } = await this.db
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async sendGroupMessage(groupId: string, content: string, imageUrl?: string, isPhotoBomb = false) {
    const myId = await this.getCurrentUserId();
    const { error } = await this.db
      .from('group_messages')
      .insert({
        sender_id: myId,
        group_id: groupId,
        content: content || null,
        image_url: imageUrl || null,
        is_photo_bomb: isPhotoBomb,
      });
    if (error) throw error;
  }

  subscribeToGroupMessages(
    groupId: string,
    onInsert: (msg: any) => void,
    onUpdate: (msg: any) => void = () => {},
    onDelete: (id: string) => void = () => {}
  ) {
    this.unsubscribe();
    this.channel = this.db
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        (payload: any) => onInsert(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        (payload: any) => onUpdate(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'group_messages' },
        (payload: any) => { if (payload.old?.id) onDelete(payload.old.id); }
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

  subscribeToUserStatus(userId: string, callback: (status: string, avatarUrl?: string) => void) {
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
        (payload: any) => callback(payload.new['user_status'], payload.new['avatar_url'])
      )
      .subscribe();
    this.statusChannels.set(userId, ch);
    return ch;
  }

  unsubscribeStatusChannels() {
    this.statusChannels.forEach(ch => this.db.removeChannel(ch));
    this.statusChannels.clear();
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

  async getLastMessage(otherUserId: string) {
    const myId = await this.getCurrentUserId();
    const { data } = await this.db
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${myId},receiver_id.eq.${otherUserId}),` +
        `and(sender_id.eq.${otherUserId},receiver_id.eq.${myId})`
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }

  async getLastGroupMessage(groupId: string) {
    const { data } = await this.db
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }

  async updateMessage(messageId: string, content: string) {
    const { error } = await this.db
      .from('messages')
      .update({ content })
      .eq('id', messageId);
    if (error) throw error;
  }

  async deleteMessage(messageId: string) {
    const { error } = await this.db
      .from('messages')
      .update({ is_deleted: true, content: null, image_url: null })
      .eq('id', messageId);
    if (error) throw error;
  }

  async updateGroupMessage(messageId: string, content: string) {
    const { error } = await this.db
      .from('group_messages')
      .update({ content })
      .eq('id', messageId);
    if (error) throw error;
  }

  async deleteGroupMessage(messageId: string) {
    const { error } = await this.db
      .from('group_messages')
      .update({ is_deleted: true, content: null, image_url: null })
      .eq('id', messageId);
    if (error) throw error;
  }

  async clearPhotoBombImage(messageId: string) {
    const { error } = await this.db.rpc('clear_photo_bomb_image', { p_message_id: messageId });
    if (error) throw error;
  }

  subscribeToProfileContacts(userId: string, callback: () => void) {
    const ch = this.db
      .channel(`profile-contacts-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        () => callback()
      )
      .subscribe();
    return ch;
  }

  async getUserStatus(userId: string): Promise<string> {
    const { data } = await this.db
      .from('profiles')
      .select('user_status')
      .eq('id', userId)
      .single();
    return data?.user_status || 'offline';
  }

  subscribeToIncomingMessages(myId: string, callback: (msg: any) => void): any {
    const ch = this.db
      .channel(`home-msgs-${myId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${myId}` },
        (payload: any) => callback(payload.new)
      )
      .subscribe();
    return ch;
  }

  subscribeToIncomingGroupMessages(groupId: string, callback: (msg: any) => void): any {
    const ch = this.db
      .channel(`home-group-${groupId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        (payload: any) => callback(payload.new)
      )
      .subscribe();
    return ch;
  }

  removeChannel(ch: any) {
    if (ch) this.db.removeChannel(ch);
  }

  // ── Global buzz (cross-page) ──────────────────────────

  subscribeToGlobalBuzz(
    myId: string,
    onBuzz: (from: string, name: string) => void
  ): any {
    return this.db
      .channel(`user-buzz-${myId}`)
      .on('broadcast', { event: 'buzz' }, (payload: any) => {
        onBuzz(payload.payload?.from ?? '', payload.payload?.name ?? '');
      })
      .subscribe();
  }

  async sendGlobalBuzz(toUserId: string, fromUserId: string, fromName: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const ch = this.db.channel(`user-buzz-${toUserId}`);
      const timer = setTimeout(() => {
        this.db.removeChannel(ch);
        resolve();
      }, 5000);

      ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          ch.send({
            type: 'broadcast',
            event: 'buzz',
            payload: { from: fromUserId, name: fromName },
          }).then(() => {
            this.db.removeChannel(ch);
            resolve();
          }).catch(() => {
            this.db.removeChannel(ch);
            resolve();
          });
        }
      });
    });
  }

  subscribeToAuthChanges(callback: (userId: string | null) => void): void {
    this.db.auth.onAuthStateChange((_event: any, session: any) => {
      callback(session?.user?.id ?? null);
    });
  }

  private profileCache = new Map<string, string>();

  async getProfileDisplayName(userId: string): Promise<string> {
    if (this.profileCache.has(userId)) return this.profileCache.get(userId)!;
    const { data } = await this.db
      .from('profiles')
      .select('full_name, username')
      .eq('id', userId)
      .single();
    const name = data?.full_name || data?.username || '';
    if (name) this.profileCache.set(userId, name);
    return name;
  }
}
