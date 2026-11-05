-- ============================================================
-- 월렛미러 익명 통계용 테이블 + RLS 정책
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- (여러 번 실행해도 되도록 작성했어요)
-- ============================================================

-- 1) 테이블: 진단 결과 요약만 저장 (개인 소비 내역·CSV는 저장하지 않음)
create table if not exists public.results (
  id             uuid        primary key default gen_random_uuid(),
  type_name      text        not null check (char_length(type_name) between 1 and 30),
  category_ratio jsonb       not null check (jsonb_typeof(category_ratio) = 'object'),
  created_at     timestamptz not null default now()
);

-- 2) Row Level Security 켜기
alter table public.results enable row level security;

-- 3) 권한: 익명(anon)은 insert / select 만. update·delete 는 권한 자체를 회수
revoke all on public.results from anon, authenticated;
grant insert, select on public.results to anon;

-- 4) 정책: 익명 사용자는 insert 와 select 만 가능 (update/delete 정책은 만들지 않음 = 거부)
drop policy if exists "anon can insert results" on public.results;
create policy "anon can insert results"
  on public.results for insert
  to anon
  with check (true);

drop policy if exists "anon can select results" on public.results;
create policy "anon can select results"
  on public.results for select
  to anon
  using (true);
