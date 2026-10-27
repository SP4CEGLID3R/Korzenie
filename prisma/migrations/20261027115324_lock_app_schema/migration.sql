-- Zabezpieczenie: schemat "app" jest dostępny wyłącznie dla serwera aplikacji
-- (rola postgres przez Prismę). Odbieramy dostęp rolom publicznego API Supabase,
-- nawet gdyby ktoś kiedyś dodał "app" do udostępnianych schematów.
-- Na zwykłym Postgresie (bez Supabase) tych ról nie ma – wtedy nic nie robimy.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END
$$;
