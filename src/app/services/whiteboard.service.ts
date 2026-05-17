import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface WhiteboardStroke {
  id?: string;
  chat_id: string;
  user_id?: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  opacity: number;
  tool: 'pen' | 'eraser';
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class WhiteboardService {

  constructor(private supabase: SupabaseService) {}

  private get db() { return this.supabase.getClient(); }

  async loadStrokes(chatId: string): Promise<WhiteboardStroke[]> {
    const { data, error } = await this.db
      .from('whiteboard_strokes')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as WhiteboardStroke[];
  }

  async saveStroke(stroke: WhiteboardStroke): Promise<void> {
    const { data: { session } } = await this.db.auth.getSession();
    const { error } = await this.db.from('whiteboard_strokes').insert({
      chat_id:  stroke.chat_id,
      user_id:  session?.user.id,
      points:   stroke.points,
      color:    stroke.color,
      width:    stroke.width,
      opacity:  stroke.opacity,
      tool:     stroke.tool,
    });
    if (error) throw error;
  }

  async clearStrokes(chatId: string, channel: any): Promise<void> {
    const { error } = await this.db
      .from('whiteboard_strokes')
      .delete()
      .eq('chat_id', chatId);
    if (error) throw error;
    if (channel) {
      await channel.send({ type: 'broadcast', event: 'wb-clear', payload: {} }).catch(() => {});
    }
  }

  subscribe(
    chatId: string,
    onInsert: (stroke: WhiteboardStroke) => void,
    onClear: () => void,
  ): any {
    return this.db
      .channel(`whiteboard-${chatId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whiteboard_strokes',
        filter: `chat_id=eq.${chatId}`,
      }, (payload: any) => onInsert(payload.new as WhiteboardStroke))
      .on('broadcast', { event: 'wb-clear' }, () => onClear())
      .subscribe();
  }

  removeChannel(channel: any) {
    if (channel) this.db.removeChannel(channel).catch(() => {});
  }
}
