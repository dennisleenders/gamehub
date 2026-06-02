-- Optional demo data. Run AFTER you've created at least one account via the app
-- (so a profile exists). Replace the user-id placeholders with real profile ids
-- from: select id, name from public.profiles;

-- Example: two games, one finished by you, one you're playing.
-- insert into public.games (title, platform, status, condition, region, genre, year, developer, publisher, rating, value_cents, hltb, added_by)
-- values
--   ('Metal Gear Solid','PS1','owned','CIB','PAL','Action',1998,'Konami','Konami',94,3500,'{"main":12,"extra":16,"complete":24}','<YOUR_PROFILE_ID>'),
--   ('Persona 5 Royal','PS4','owned','CIB','PAL','RPG',2019,'Atlus','Atlus',95,4000,'{"main":103,"extra":130,"complete":143}','<YOUR_PROFILE_ID>');

-- Then attach per-user progress:
-- insert into public.progress (game_id, user_id, status, hours)
-- select id, '<YOUR_PROFILE_ID>', 'finished', 14 from public.games where title = 'Metal Gear Solid';
