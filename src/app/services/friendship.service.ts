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

  // Aceptar petición y añadir ambos usuarios a sus respectivas listas de contactos
  async acceptRequest(friendshipId: string) {
    // Obtener sender y receiver antes de actualizar
    const { data: friendship, error: fetchError } = await this.db
      .from('friendships')
      .select('sender_id, receiver_id')
      .eq('id', friendshipId)
      .single();

    if (fetchError) throw fetchError;

    // Eliminar la petición (ya no necesaria una vez aceptada)
    const { error } = await this.db
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (error) throw error;

    // Añadir cada usuario al array contacts del otro (requiere admin para escribir en perfil ajeno)
    const admin = this.supabase.getAdminClient();
    const { senderId, receiverId } = { senderId: friendship.sender_id, receiverId: friendship.receiver_id };

    // Traer contacts actuales de ambos
    const [{ data: senderProfile }, { data: receiverProfile }] = await Promise.all([
      admin.from('profiles').select('contacts').eq('id', senderId).single(),
      admin.from('profiles').select('contacts').eq('id', receiverId).single(),
    ]);

    const senderContacts: string[] = senderProfile?.contacts || [];
    const receiverContacts: string[] = receiverProfile?.contacts || [];

    await Promise.all([
      // Añadir receiver a los contactos del sender
      ...(!senderContacts.includes(receiverId) ? [
        admin.from('profiles').update({ contacts: [...senderContacts, receiverId] }).eq('id', senderId)
      ] : []),
      // Añadir sender a los contactos del receiver
      ...(!receiverContacts.includes(senderId) ? [
        admin.from('profiles').update({ contacts: [...receiverContacts, senderId] }).eq('id', receiverId)
      ] : []),
    ]);
  }

  // Rechazar petición (elimina el registro)
  async rejectRequest(friendshipId: string) {
    const { error } = await this.db
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (error) throw error;
  }

  // Obtener contactos del usuario desde su array contacts en profiles
  async getFriends() {
    const myId = await this.currentUserId();

    // Leer mi array de contactos
    const { data: myProfile, error: profileError } = await this.db
      .from('profiles')
      .select('contacts')
      .eq('id', myId)
      .single();

    if (profileError) throw profileError;

    const contactIds: string[] = myProfile?.contacts || [];
    if (contactIds.length === 0) return [];

    // Traer los perfiles de todos los contactos
    const { data, error } = await this.db
      .from('profiles')
      .select('id, full_name, username, avatar_url, user_status')
      .in('id', contactIds);

    if (error) throw error;

    return (data || []).map((p: any) => ({
      id: p.id as string,
      name: (p.full_name || p.username || 'Usuario') as string,
      bio: (p.username || '') as string,
      status: (p.user_status || 'offline') as 'online' | 'away' | 'busy' | 'offline',
      avatarColor: this.colorFromId(p.id),
      avatarUrl: (p.avatar_url || '') as string,
    }));
  }

  // Obtener grupos del usuario
  async getGroups() {
    const myId = await this.currentUserId();
    try {
      const { data, error } = await this.db
        .from('group_members')
        .select('group:groups (id, name, avatar_url)')
        .eq('user_id', myId);

      if (error) return [];
      return ((data || []).map((m: any) => m.group).filter(Boolean)) as Array<{
        id: string; name: string; avatar_url: string;
      }>;
    } catch {
      return [];
    }
  }

  // Crear un grupo con los miembros seleccionados
  async createGroup(name: string, avatarColor: string, memberIds: string[]) {
    const myId = await this.currentUserId();
    const admin = this.supabase.getAdminClient();

    // Insertar el grupo
    const { data: group, error: groupError } = await admin
      .from('groups')
      .insert({ name, avatar_color: avatarColor, created_by: myId })
      .select('id')
      .single();

    if (groupError) throw groupError;

    // Insertar miembros (incluido el creador)
    const allMembers = [...new Set([myId, ...memberIds])];
    const memberRows = allMembers.map(userId => ({ group_id: group.id, user_id: userId }));

    const { error: membersError } = await admin
      .from('group_members')
      .insert(memberRows);

    if (membersError) throw membersError;
  }

  private colorFromId(id: string): string {
    const colors = ['#27ae60', '#2980b9', '#e67e22', '#8e44ad', '#c0392b', '#d35400', '#16a085', '#f39c12'];
    return colors[id.charCodeAt(0) % colors.length];
  }

  // Verificar si ya hay una relación entre dos usuarios
  async getFriendshipStatus(targetId: string): Promise<'none' | 'pending_sent' | 'pending_received' | 'accepted'> {
    const myId = await this.currentUserId();

    // Si el target ya está en mis contactos, son amigos
    const { data: myProfile } = await this.db
      .from('profiles')
      .select('contacts')
      .eq('id', myId)
      .single();

    if ((myProfile?.contacts || []).includes(targetId)) return 'accepted';

    // Si no, comprobar si hay petición pendiente
    const { data } = await this.db
      .from('friendships')
      .select('sender_id')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${myId})`)
      .maybeSingle();

    if (!data) return 'none';
    return data.sender_id === myId ? 'pending_sent' : 'pending_received';
  }
}
