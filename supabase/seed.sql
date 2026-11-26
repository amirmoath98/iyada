-- بيانات تجريبية: عيادة ومركز أشعة مرتبط. شغّلها بعد الـ migrations.
-- بعد ما تسوي حسابات من Supabase Auth، اربطها بالعيادات من لوحة الإدارة أو بهالأوامر:
--   insert into staff (user_id, clinic_id, role) values ('<uuid الطبيب>', (select id from clinics where slug='dr-ahmed'), 'doctor');
--   insert into staff (user_id, clinic_id, role) values ('<uuid السكرتير>', (select id from clinics where slug='dr-ahmed'), 'secretary');
--   insert into staff (user_id, clinic_id, role) values ('<uuid مركز الأشعة>', (select id from clinics where slug='rad-center'), 'partner');
--   insert into admins (user_id) values ('<uuid حسابك>');

insert into clinics (slug, name, doctor_name, specialty, bio, hours, fee, phone, building, floor, room, landmark, area, gov,
                     open_time, daily_limit, near_areas, questions)
values ('dr-ahmed', 'عيادة العظام والمفاصل (تجريبية)', 'د. أحمد الربيعي', 'العظام والمفاصل',
        'اختصاص جراحة العظام والمفاصل والإصابات الرياضية.', 'الأحد إلى الخميس، ٤ إلى ٩ مساءً', '٢٥ ألف دينار',
        '07700000000', 'عمارة الأطباء (تجريبي)', 'الطابق الثاني', 'عيادة ٢٠٤', 'مقابل صيدلية النور', 'الحارثية', 'بغداد',
        '16:00', 30, array['المنصور','الحارثية','اليرموك','العامرية','حي الجامعة','البياع','الكاظمية'],
        '["وين الألم بالضبط؟","من متى؟","عندك أشعة سابقة؟"]'),
       ('rad-center', 'مركز الأشعة (تجريبي)', 'د. سامر', 'الأشعة والسونار', '', 'يومياً ٩ صباحاً إلى ٩ مساءً', '',
        '07700000001', 'عمارة الأطباء (تجريبي)', 'الطابق الأول', 'عيادة ١٠٢', '', 'الحارثية', 'بغداد',
        '09:00', 100, '{}', '[]')
on conflict (slug) do nothing;
update clinics set kind = 'radiology' where slug = 'rad-center';

insert into clinic_links (from_clinic, to_clinic, status)
select a.id, b.id, 'accepted' from clinics a, clinics b where a.slug = 'dr-ahmed' and b.slug = 'rad-center'
on conflict do nothing;
