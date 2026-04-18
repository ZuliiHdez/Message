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

  async sendFriendRequest(receiverId: string) {
    const myId = await this.currentUserId();
    const { error } = await this.db
      .from('friendships')
      .insert({ sender_id: myId, receiver_id: receiverId, status: 'pending' });

    if (error) throw error;
  }

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

  async acceptRequest(friendshipId: string) {
    const { error } = await this.db.rpc('accept_friend_request', { p_friendship_id: friendshipId });
    if (error) throw error;
  }

  async rejectRequest(friendshipId: string) {
    const { error } = await this.db
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (error) throw error;
  }

  async getFriends() {
    const myId = await this.currentUserId();

    const { data: myProfile, error: profileError } = await this.db
      .from('profiles')
      .select('contacts')
      .eq('id', myId)
      .single();

    if (profileError) throw profileError;

    const contactIds: string[] = myProfile?.contacts || [];
    if (contactIds.length === 0) return [];

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

  async getGroups() {
    const myId = await this.currentUserId();
    if (!myId) return [];
    try {
      const { data: members, error: membersError } = await this.db
        .from('group_members')
        .select('group_id')
        .eq('user_id', myId);

      if (membersError || !members?.length) return [];

      const groupIds = members.map((m: any) => m.group_id);
      const { data: groups, error: groupsError } = await this.db
        .from('groups')
        .select('id, name, avatar_url, avatar_color')
        .in('id', groupIds);

      if (groupsError) return [];
      return (groups || []) as Array<{
        id: string; name: string; avatar_url: string; avatar_color: string;
      }>;
    } catch {
      return [];
    }
  }

  async getGroupMembers(groupId: string): Promise<{ count: number; profiles: Array<{ id: string; full_name: string; username: string; avatar_url: string }> }> {
    const { data: members, error } = await this.db
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);

    if (error || !members?.length) return { count: 0, profiles: [] };

    const userIds = members.map((m: any) => m.user_id);
    const { data: profiles } = await this.db
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', userIds);

    return {
      count: userIds.length,
      profiles: (profiles || []) as Array<{ id: string; full_name: string; username: string; avatar_url: string }>,
    };
  }

  async createGroup(name: string, avatarColor: string, memberIds: string[]) {
    const myId = await this.currentUserId();

    const { data: group, error: groupError } = await this.db
      .from('groups')
      .insert({ name, avatar_color: avatarColor, created_by: myId })
      .select('id')
      .single();

    if (groupError) throw groupError;

    const allMembers = [...new Set([myId, ...memberIds])];
    const memberRows = allMembers.map(userId => ({ group_id: group.id, user_id: userId }));

    const { error: membersError } = await this.db
      .from('group_members')
      .insert(memberRows);

    if (membersError) throw membersError;
  }

  private colorFromId(id: string): string {
    const colors = ['#27ae60', '#2980b9', '#e67e22', '#8e44ad', '#c0392b', '#d35400', '#16a085', '#f39c12'];
    return colors[id.charCodeAt(0) % colors.length];
  }

  async getFriendshipStatus(targetId: string): Promise<'none' | 'pending_sent' | 'pending_received' | 'accepted'> {
    const myId = await this.currentUserId();

    const { data: myProfile } = await this.db
      .from('profiles')
      .select('contacts')
      .eq('id', myId)
      .single();

    if ((myProfile?.contacts || []).includes(targetId)) return 'accepted';

    const { data } = await this.db
      .from('friendships')
      .select('sender_id')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${myId})`)
      .maybeSingle();

    if (!data) return 'none';
    return data.sender_id === myId ? 'pending_sent' : 'pending_received';
  }

  async getProfileName(userId: string): Promise<string | null> {
    const { data } = await this.db
      .from('profiles')
      .select('full_name, username')
      .eq('id', userId)
      .maybeSingle();
    return data ? (data.full_name || data.username || null) : null;
  }
}
