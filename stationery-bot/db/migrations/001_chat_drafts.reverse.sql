-- ย้อนกลับ 001_chat_drafts.sql · ใช้ได้เฉพาะก่อนมีข้อมูลจริงในตาราง chat_* (ลบข้อมูลร่างและประวัติทั้งหมด)
-- ไม่ลบ bucket chat-media (ลบเองใน Storage ถ้าว่างแล้ว) · ไม่แตะตาราง ฟังก์ชัน หรือข้อมูลเดิมของร้าน

drop function if exists public.chat_draft_pos(uuid, uuid, text, text);
drop function if exists public.chat_draft_cancel(uuid, integer, text, text);
drop function if exists public.chat_draft_confirm(uuid, integer, text);
drop function if exists public.chat_draft_save(uuid, integer, jsonb, text, text, text, date, text, text);
drop function if exists public.chat_next_draft_no();

drop policy if exists "staff read chat-media" on storage.objects;

drop table if exists public.chat_draft_events;
drop table if exists public.chat_messages;
drop table if exists public.chat_drafts;
drop sequence if exists public.chat_draft_seq;
drop table if exists public.line_channels;
