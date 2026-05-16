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

  private async getBlockedIds(myId: string): Promise<Set<string>> {
    const { data } = await this.db
      .from('blocked_users')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${myId},blocked_id.eq.${myId}`);
    const set = new Set<string>();
    for (const row of (data || [])) {
      set.add(row.blocker_id === myId ? row.blocked_id : row.blocker_id);
    }
    return set;
  }

  async removeFriend(targetId: string): Promise<void> {
    const { error } = await this.db.rpc('remove_friend', { p_friend_id: targetId });
    if (error) throw error;
  }

  async blockUser(targetId: string): Promise<void> {
    const myId = await this.currentUserId();
    const { error } = await this.db
      .from('blocked_users')
      .insert({ blocker_id: myId, blocked_id: targetId });
    if (error) throw error;
  }

  async unblockUser(targetId: string): Promise<void> {
    const myId = await this.currentUserId();
    const { error } = await this.db
      .from('blocked_users')
      .delete()
      .eq('blocker_id', myId)
      .eq('blocked_id', targetId);
    if (error) throw error;
  }

  async getBlockedUsers(): Promise<Array<{ id: string; name: string; username: string; avatarUrl: string; avatarColor: string }>> {
    const myId = await this.currentUserId();
    const { data, error } = await this.db
      .from('blocked_users')
      .select('blocked_id, profiles!blocked_users_blocked_id_fkey(id, full_name, username, avatar_url)')
      .eq('blocker_id', myId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.blocked_id,
      name: r.profiles?.full_name || r.profiles?.username || 'Usuario',
      username: r.profiles?.username || '',
      avatarUrl: r.profiles?.avatar_url || '',
      avatarColor: this.colorFromId(r.blocked_id),
    }));
  }

  async searchUsers(query: string) {
    const myId = await this.currentUserId();
    const blocked = await this.getBlockedIds(myId);
    const excludeIds = [myId, ...Array.from(blocked)];

    const { data, error } = await this.db
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
      .not('id', 'in', `(${excludeIds.join(',')})`)
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
    const blocked = await this.getBlockedIds(myId);

    const { data: myProfile, error: profileError } = await this.db
      .from('profiles')
      .select('contacts')
      .eq('id', myId)
      .single();

    if (profileError) throw profileError;

    const allIds: string[] = myProfile?.contacts || [];
    const contactIds = allIds.filter(id => !blocked.has(id));
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

  async getGroupMembers(groupId: string): Promise<{ count: number; profiles: Array<{ id: string; full_name: string; username: string; avatar_url: string; role: string }> }> {
    const { data: members, error } = await this.db
      .from('group_members')
      .select('user_id, role')
      .eq('group_id', groupId);

    if (error || !members?.length) return { count: 0, profiles: [] };

    const userIds = members.map((m: any) => m.user_id);
    const roleMap = new Map<string, string>(members.map((m: any) => [m.user_id, m.role]));

    const { data: profiles } = await this.db
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', userIds);

    return {
      count: userIds.length,
      profiles: (profiles || []).map((p: any) => ({
        ...p,
        role: roleMap.get(p.id) || 'member',
      })),
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
    const memberRows = allMembers.map(userId => ({
      group_id: group.id,
      user_id: userId,
      role: userId === myId ? 'owner' : 'member',
    }));

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

  async removeMemberFromGroup(groupId: string, userId: string): Promise<void> {
    const { error } = await this.db.rpc('remove_group_member', { p_group_id: groupId, p_target_id: userId });
    if (error) throw error;
  }

  async setGroupMemberRole(groupId: string, userId: string, role: 'member' | 'admin'): Promise<void> {
    const { error } = await this.db.rpc('set_group_member_role', { p_group_id: groupId, p_target_id: userId, p_role: role });
    if (error) throw error;
  }

  async transferGroupOwnership(groupId: string, newOwnerId: string): Promise<void> {
    const { error } = await this.db.rpc('transfer_group_ownership', { p_group_id: groupId, p_new_owner_id: newOwnerId });
    if (error) throw error;
  }

  async deleteGroup(groupId: string): Promise<void> {
    const { error } = await this.db.rpc('delete_group', { p_group_id: groupId });
    if (error) throw error;
  }

  async leaveGroup(groupId: string): Promise<void> {
    const { error } = await this.db.rpc('leave_group', { p_group_id: groupId });
    if (error) throw error;
  }

  async updateGroupInfo(groupId: string, name: string, avatarColor: string): Promise<void> {
    const { error } = await this.db.rpc('update_group_info', { p_group_id: groupId, p_name: name, p_avatar_color: avatarColor });
    if (error) throw error;
  }

  async getGroupInfo(groupId: string): Promise<{ name: string; avatar_color: string; avatar_url: string } | null> {
    const { data, error } = await this.db
      .from('groups')
      .select('name, avatar_color, avatar_url')
      .eq('id', groupId)
      .single();
    if (error) return null;
    return data;
  }

  async updateGroupAvatarUrl(groupId: string, avatarUrl: string): Promise<void> {
    const { error } = await this.db
      .from('groups')
      .update({ avatar_url: avatarUrl })
      .eq('id', groupId);
    if (error) throw error;
  }

  async addMemberToGroup(groupId: string, userId: string): Promise<void> {
    const { error } = await this.db.rpc('add_group_member', { p_group_id: groupId, p_user_id: userId });
    if (error) throw error;
  }

  subscribeToGroupChanges(
    groupId: string,
    callback: (data: { name: string; avatar_color: string; avatar_url: string }) => void
  ): any {
    return this.db
      .channel(`group-meta-${groupId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'groups',
        filter: `id=eq.${groupId}`,
      }, (payload: any) => callback(payload.new))
      .subscribe();
  }

  async subscribeToIncomingRequests(callback: () => void): Promise<any> {
    const myId = await this.currentUserId();
    if (!myId) return null;
    return this.db
      .channel(`incoming-requests-${myId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'friendships',
        filter: `receiver_id=eq.${myId}`,
      }, () => callback())
      .subscribe();
  }

  removeChannel(channel: any) {
    if (channel) this.db.removeChannel(channel);
  }
}
