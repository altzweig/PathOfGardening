-- PathOfGardening: Freunde + Besuche (Basti 22.11.2026, angepasst aus der Koop-Übergabe).
-- Einmal im Supabase-Dashboard unter "SQL Editor" ausführen. Spielstände bleiben lokal im Browser:
-- hier liegen nur Profil (Name, Freundescode), Freundschaften und Besuchsanfragen.

-- Profile: ein Eintrag pro Konto (anonymes Konto pro Browser/Gerät)
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 28),
  friend_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  level int not null default 1 check (level between 1 and 99),
  created_at timestamptz not null default now()
);

-- Freundschaften: user_a schickt die Anfrage, user_b nimmt an
create table public.friendships (
  user_a uuid not null references public.profiles on delete cascade,
  user_b uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a <> user_b)
);

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted' and ((user_a = a and user_b = b) or (user_a = b and user_b = a))
  );
$$;

-- Freund per Code hinzufügen. Hat der andere mir schon eine Anfrage geschickt, ist es sofort eine Freundschaft.
create or replace function public.add_friend(code text)
returns text language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  select id into other from profiles where friend_code = upper(trim(code));
  if other is null then return 'notfound'; end if;
  if other = auth.uid() then return 'self'; end if;
  if exists (select 1 from friendships where user_a = other and user_b = auth.uid()) then
    update friendships set status = 'accepted' where user_a = other and user_b = auth.uid();
    return 'accepted';
  end if;
  insert into friendships (user_a, user_b) values (auth.uid(), other) on conflict do nothing;
  return 'sent';
end;
$$;

-- Besuchsanfragen: "Darf ich dich besuchen?" mit geprüfter Identität. room + ticket setzt der Gastgeber beim Annehmen
-- (nur Gastgeber und Besucher können die Zeile lesen); mit dem ticket kommt der Besucher ohne zweites Nachfragen rein.
create table public.visit_requests (
  id uuid primary key,
  host_id uuid not null references public.profiles on delete cascade,
  visitor_id uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  room text,
  ticket text,
  created_at timestamptz not null default now()
);
create index on public.visit_requests (host_id, created_at);

alter publication supabase_realtime add table public.visit_requests;
alter publication supabase_realtime add table public.friendships;

-- ---------- Row Level Security ----------
alter table public.profiles       enable row level security;
alter table public.friendships    enable row level security;
alter table public.visit_requests enable row level security;

create policy "Profile lesen"  on public.profiles for select to authenticated using (true);
create policy "Eigenes Profil" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "Profil ändern"  on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Eigene Freundschaften sehen" on public.friendships for select to authenticated
  using (auth.uid() in (user_a, user_b));
create policy "Anfrage annehmen" on public.friendships for update to authenticated
  using (user_b = auth.uid()) with check (user_b = auth.uid());
create policy "Freundschaft beenden" on public.friendships for delete to authenticated
  using (auth.uid() in (user_a, user_b));

create policy "Besuch anfragen (nur Freunde)" on public.visit_requests for insert to authenticated
  with check (visitor_id = auth.uid() and status = 'pending' and room is null and ticket is null
              and public.are_friends(visitor_id, host_id));
create policy "Eigene Besuche sehen" on public.visit_requests for select to authenticated
  using (auth.uid() in (host_id, visitor_id));
create policy "Gastgeber entscheidet" on public.visit_requests for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

-- Nur die Spalten, die das Spiel wirklich ändert (sonst könnte z. B. der Annehmende user_a umschreiben)
revoke insert, update on public.profiles from authenticated, anon;
grant insert (id, name, level) on public.profiles to authenticated;
grant update (name, level) on public.profiles to authenticated;
revoke insert, update on public.friendships from authenticated, anon;
grant update (status) on public.friendships to authenticated;
revoke update on public.visit_requests from authenticated, anon;
grant update (status, room, ticket) on public.visit_requests to authenticated;

-- Alte Anfragen aufräumen (optional, braucht die Erweiterung pg_cron unter Database -> Extensions):
-- select cron.schedule('visit-cleanup', '0 4 * * *', $$delete from public.visit_requests where created_at < now() - interval '1 day'$$);
