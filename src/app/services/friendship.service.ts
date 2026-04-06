// friendship.service.ts
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class FriendshipService {

  constructor(private supabase: SupabaseService) {}

  private get db() {
    return this.supabase.getClient();
  }

  private async currentUserId(): Promise<string> {
    const { data } = await this.db.auth.getSession();
    return data.session?.user.id || '';
  }

  // Buscar usuarios por username o email (excluyendo al usuario actual)
  async searchUsers(query: string) {
    const myId = await this.currentUserId();
    const { data, error } = await this.db
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
      .neq('id', myId)
      .limit(20);

    if (error) throw error;
    return data || [];
  }

  // Enviar petición de amistad
  async sendFriendRequest(receiverId: string) {
    const myId = await this.currentUserId();
    const { error } = await this.db
      .from('friendships')
      .insert({ sender_id: myId, receiver_id: receiverId, status: 'pending' });

    if (error) throw error;
  }

  // Obtener peticiones recibidas pendientes
  async getPendingRequests() {
    const myId = await this.currentUserId();
    const { data, error } = await this.db
      .from('friendships')
      .select(`
        id,
        created_at,
        sender:profiles!friendships_sender_id_fkey (
          id, username, full_name, avatar_url
        )
      `)
      .eq('receiver_id', myId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Aceptar petición
  async acceptRequest(friendshipId: string) {
    const { error } = await this.db
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);

    if (error) throw error;
  }

  // Rechazar petición
  async rejectRequest(friendshipId: string) {
    const { error } = await this.db
      .from('friendships')
      .update({ status: 'rejected' })
      .eq('id', friendshipId);

    if (error) throw error;
  }

  // Verificar si ya hay una relación entre dos usuarios
  async getFriendshipStatus(targetId: string): Promise<'none' | 'pending_sent' | 'pending_received' | 'accepted'> {
    const myId = await this.currentUserId();
    const { data } = await this.db
      .from('friendships')
      .select('status, sender_id')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${myId})`)
      .maybeSingle();

    if (!data) return 'none';
    if (data.status === 'accepted') return 'accepted';
    if (data.status === 'pending') {
      return data.sender_id === myId ? 'pending_sent' : 'pending_received';
    }
    return 'none';
  }
}
