// Friends + visits over Supabase (Basti 22.11.2026, adapted from the co-op hand-over). Saves stay local in the browser:
// Supabase only knows the profile (name, friend code, level), friendships, who is online and the visit requests.
// The game itself still runs directly between the two devices (src/farm/net.ts); a request a friend accepted carries the
// room code + a ticket, so the friend comes in without a second question.
// Switched on by public/online.json ({ "url": "...", "anonKey": "..." }); without it there is no friends menu.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface Friend { id: string; name: string; level: number; online: boolean; open: boolean; /** I asked, the friend has not said yes yet */ pending?: boolean }
export interface FriendAsk { id: string; name: string; level: number }
export interface VisitAsk { id: string; visitorId: string; name: string; level: number }
interface Presence { id: string; name: string; level: number; open: boolean }

const code6 = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');

export class Online {
  db!: SupabaseClient;
  me = { id: '', name: '', code: '', level: 1 };
  friends: Friend[] = [];
  asks: FriendAsk[] = [];
  /** friend codes I sent a request to that are not answered yet */
  sent: string[] = [];
  private presence: RealtimeChannel | null = null;
  private online = new Map<string, Presence>();
  private open = false;
  onChange: () => void = () => {};
  /** a friend knocks (only while my farm is open) */
  onVisit: (a: VisitAsk) => void = () => {};
  /** a short message from a friend arrived (number of the sentence in balancing.yaml coop.messages) */
  onMessage: (from: string, name: string, msg: number) => void = () => {};
  /** newest message of each friend (last 7 days) and who wrote something I have not looked at yet */
  inbox = new Map<string, { msg: number; at: number }>();
  unread = new Set<string>();

  /** null = no Supabase configured (or not reachable): the game plays without friends */
  static async start(): Promise<Online | null> {
    try {
      const r = await fetch('./online.json', { cache: 'no-store' }); if (!r.ok) return null;
      const c = await r.json() as { url?: string; anonKey?: string }; if (!c.url || !c.anonKey) return null;
      const { createClient } = await import('@supabase/supabase-js');
      const o = new Online(); o.db = createClient(c.url, c.anonKey, { auth: { persistSession: true, storageKey: 'pog-online-auth' } });
      await o.signIn(); return o;
    } catch (e) { console.warn('online', e); return null; }
  }
  /** anonymous account per browser (later e-mail / Google can be linked to it) */
  private async signIn() {
    const { data } = await this.db.auth.getSession();
    let user = data.session?.user;
    if (!user) { const r = await this.db.auth.signInAnonymously(); if (r.error) throw r.error; user = r.data.user!; }
    this.me.id = user.id;
  }
  /** own profile: name + level of the character, created on first use */
  async profile(name: string, level: number) {
    name = name.trim().slice(0, 28) || 'Gast';
    const { data } = await this.db.from('profiles').select('name, friend_code, level').eq('id', this.me.id).maybeSingle();
    if (!data) { const r = await this.db.from('profiles').insert({ id: this.me.id, name, level }).select('friend_code').single(); if (r.error) throw r.error; this.me.code = r.data.friend_code; }
    else { this.me.code = data.friend_code; if (data.name !== name || data.level !== level) await this.db.from('profiles').update({ name, level }).eq('id', this.me.id); }
    this.me.name = name; this.me.level = level;
    if (this.presence) await this.track();
  }

  // ---------------- friends ----------------
  /** who has this friend code (shown before adding) */
  async lookup(code: string): Promise<{ id: string; name: string; level: number } | 'self' | null> {
    const { data } = await this.db.from('profiles').select('id, name, level').eq('friend_code', code.trim().toUpperCase()).maybeSingle();
    if (!data) return null; return data.id === this.me.id ? 'self' : data;
  }
  async addFriend(code: string): Promise<'notfound' | 'self' | 'accepted' | 'sent' | 'error'> {
    const { data, error } = await this.db.rpc('add_friend', { code }); if (error) return 'error';
    if (data === 'sent') this.sent.push(code.toUpperCase());
    await this.refresh(); return data;
  }
  async answerFriend(id: string, yes: boolean) {
    if (yes) await this.db.from('friendships').update({ status: 'accepted' }).eq('user_a', id).eq('user_b', this.me.id);
    else await this.db.from('friendships').delete().eq('user_a', id).eq('user_b', this.me.id);
    await this.refresh();
  }
  async removeFriend(id: string) {
    await this.db.from('friendships').delete().or(`and(user_a.eq.${this.me.id},user_b.eq.${id}),and(user_a.eq.${id},user_b.eq.${this.me.id})`);
    await this.refresh();
  }
  /** friendships + names from the database, online state from the presence channel */
  async refresh() {
    const { data } = await this.db.from('friendships').select('user_a, user_b, status');
    const rows = data ?? [], ids = [...new Set(rows.map(r => r.user_a === this.me.id ? r.user_b : r.user_a))];
    const names = new Map<string, { name: string; level: number }>();
    if (ids.length) { const p = await this.db.from('profiles').select('id, name, level').in('id', ids); for (const x of p.data ?? []) names.set(x.id, x); }
    const nm = (id: string) => names.get(id) ?? { name: '?', level: 1 };
    this.friends = rows.filter(r => r.status === 'accepted' || r.user_a === this.me.id).map(r => {
      const id = r.user_a === this.me.id ? r.user_b : r.user_a, pending = r.status !== 'accepted', p = pending ? undefined : this.online.get(id);
      return { id, name: p?.name ?? nm(id).name, level: p?.level ?? nm(id).level, online: !!p, open: !!p?.open, pending };
    }).sort((a, b) => +b.open - +a.open || +b.online - +a.online || +!!a.pending - +!!b.pending || a.name.localeCompare(b.name));
    this.asks = rows.filter(r => r.status === 'pending' && r.user_b === this.me.id).map(r => ({ id: r.user_a, ...nm(r.user_a) }));
    this.onChange();
  }

  // ---------------- online + open farm ----------------
  async goOnline() {
    if (this.presence) return;
    const ch = this.db.channel('online', { config: { presence: { key: this.me.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      this.online.clear();
      for (const [id, metas] of Object.entries(ch.presenceState<Presence>())) { const m = metas[0]; if (m) this.online.set(id, { id, name: m.name, level: m.level, open: m.open }); }
      for (const f of this.friends) { if (f.pending) continue; const p = this.online.get(f.id); f.online = !!p; f.open = !!p?.open; if (p) { f.name = p.name; f.level = p.level; } }
      this.onChange();
    });
    // friend requests / answers come in live
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => void this.refresh());
    await new Promise<void>((ok, bad) => ch.subscribe(s => { if (s === 'SUBSCRIBED') ok(); else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') bad(new Error(s)); }));
    this.presence = ch; await this.track(); await this.refresh();
    await this.loadInbox();
    // short messages to me
    this.db.channel('messages:' + this.me.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_id=eq.${this.me.id}` }, p => {
      const r = p.new as { from_id: string; msg: number; created_at: string };
      this.inbox.set(r.from_id, { msg: r.msg, at: Date.parse(r.created_at) || Date.now() }); this.unread.add(r.from_id);
      this.onMessage(r.from_id, this.friends.find(f => f.id === r.from_id)?.name ?? '?', r.msg); this.onChange();
    }).subscribe();
    // knocks at my farm
    this.db.channel('requests:' + this.me.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visit_requests', filter: `host_id=eq.${this.me.id}` }, async p => {
      const r = p.new as { id: string; visitor_id: string; status: string }; if (r.status !== 'pending') return;
      if (!this.open) { await this.db.from('visit_requests').update({ status: 'rejected' }).eq('id', r.id); return; }
      const f = this.friends.find(x => x.id === r.visitor_id) ?? (await this.db.from('profiles').select('name, level').eq('id', r.visitor_id).single()).data;
      this.onVisit({ id: r.id, visitorId: r.visitor_id, name: f?.name ?? '?', level: f?.level ?? 1 });
    }).subscribe();
  }
  // ---------------- short messages ----------------
  private seenKey() { return 'pog-msg-seen-' + this.me.id; }
  private async loadInbox() {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data } = await this.db.from('messages').select('from_id, msg, created_at').eq('to_id', this.me.id).gte('created_at', since).order('created_at', { ascending: true }).limit(200);
    let seen = 0; try { seen = +(localStorage.getItem(this.seenKey()) ?? 0) || 0; } catch { /* ignore */ }
    for (const r of data ?? []) { const at = Date.parse(r.created_at); this.inbox.set(r.from_id, { msg: r.msg, at }); if (at > seen) this.unread.add(r.from_id); }
  }
  /** the friends list was looked at: no more unread marks */
  markRead() { this.unread.clear(); try { localStorage.setItem(this.seenKey(), String(Date.now())); } catch { /* ignore */ } this.onChange(); }
  async send(to: string, msg: number) {
    const { error } = await this.db.from('messages').insert({ from_id: this.me.id, to_id: to, msg }); return !error;
  }

  private track() { return this.presence?.track({ id: this.me.id, name: this.me.name, level: this.me.level, open: this.open }); }
  /** my farm is open for friends (or closed again) */
  async setOpen(open: boolean) { if (this.open === open) return; this.open = open; await this.track(); }

  // ---------------- visits ----------------
  /** host: yes = the friend gets the room code + a ticket (it comes in without a second question), returns the ticket */
  async answerVisit(id: string, yes: boolean, room: string, keep?: (ticket: string) => void): Promise<string | null> {
    const ticket = yes ? code6() + code6() : null;
    if (ticket) keep?.(ticket); // before the friend can see it
    await this.db.from('visit_requests').update(yes ? { status: 'accepted', room, ticket } : { status: 'rejected' }).eq('id', id);
    return ticket;
  }
  /** visitor: knocks at a friend's farm; resolves with room + ticket once the friend says yes */
  visit(hostId: string, timeout = 60000): { done: Promise<{ room: string; ticket: string }>; cancel: () => void } {
    const id = crypto.randomUUID();
    let ch: RealtimeChannel | null = null, timer = 0;
    const end = () => { clearTimeout(timer); if (ch) void this.db.removeChannel(ch); ch = null; };
    let cancel = () => end();
    const done = new Promise<{ room: string; ticket: string }>((ok, bad) => {
      cancel = () => { end(); bad(new Error('cancel')); };
      timer = window.setTimeout(() => { end(); bad(new Error('timeout')); }, timeout);
      ch = this.db.channel('request:' + id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'visit_requests', filter: `id=eq.${id}` }, p => {
        const r = p.new as { status: string; room: string | null; ticket: string | null };
        if (r.status === 'rejected') { end(); bad(new Error('deny')); }
        else if (r.status === 'accepted' && r.room && r.ticket) { end(); ok({ room: r.room, ticket: r.ticket }); }
      });
      // listen first, then knock, so the answer cannot get lost
      ch.subscribe(async s => {
        if (s !== 'SUBSCRIBED') { if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { end(); bad(new Error('lost')); } return; }
        const { error } = await this.db.from('visit_requests').insert({ id, host_id: hostId, visitor_id: this.me.id });
        if (error) { end(); bad(new Error('notfriend')); }
      });
    });
    return { done, cancel };
  }
}
