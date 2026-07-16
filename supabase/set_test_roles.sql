-- Run AFTER creating the three test users in Authentication -> Users
update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'admin@vigneshwara.test');
update public.profiles set role = 'editor'
  where id = (select id from auth.users where email = 'editor@vigneshwara.test');
update public.profiles set role = 'viewer'
  where id = (select id from auth.users where email = 'viewer@vigneshwara.test');

-- Verify:
select u.email, p.role from public.profiles p join auth.users u on u.id = p.id;
