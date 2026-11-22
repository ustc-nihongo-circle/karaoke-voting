BEGIN;

-- Supabase installations may have explicit grants in addition to PUBLIC defaults.
REVOKE ALL ON TABLE public.karaoke_2026_state, public.karaoke_2026_rounds,
    public.karaoke_2026_ballots, public.karaoke_2026_draws, public.karaoke_admin_accounts,
    public.karaoke_admin_sessions, public.karaoke_admin_audit, public.karaoke_staff_permission_audit
    FROM PUBLIC, anon, authenticated, karaoke_worker;

-- Only the owner of the permission-checked admin functions needs these helpers.
REVOKE EXECUTE ON FUNCTION public.karaoke_2026_switch(uuid, boolean),
    public.karaoke_2026_record_draw(uuid, jsonb, text, jsonb, jsonb),
    public.karaoke_admin_actor(text), public.karaoke_admin_login(text, text, text)
    FROM PUBLIC, anon, authenticated, karaoke_worker;

-- Upgrade legacy SHA-256 verifiers without requiring a password reset.
UPDATE public.karaoke_admin_accounts
SET password_hash = extensions.crypt(password_hash, extensions.gen_salt('bf', 12))
WHERE password_hash ~ '^[0-9a-f]{64}$';

CREATE OR REPLACE FUNCTION public.karaoke_admin_sign_in(account text, verifier text, token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    PERFORM 1 FROM public.karaoke_admin_accounts a
    WHERE a.username = account AND a.enabled
      AND a.password_hash = extensions.crypt(verifier, a.password_hash)
    FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
    DELETE FROM public.karaoke_admin_sessions WHERE expires_at <= clock_timestamp();
    INSERT INTO public.karaoke_admin_sessions (token_hash, username, expires_at)
    VALUES (token, account, clock_timestamp() + interval '8 hours');
    RETURN true;
END;
$$;

COMMIT;
