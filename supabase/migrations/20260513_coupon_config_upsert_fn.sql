create or replace function public.upsert_coupon_config(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coupon_config (key, value)
  values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;

grant execute on function public.upsert_coupon_config(text, jsonb) to service_role;
