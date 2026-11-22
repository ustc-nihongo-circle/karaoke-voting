BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'karaoke_admin_accounts' AND column_name = 'can_manage_voting') THEN
        ALTER TABLE public.karaoke_admin_accounts
            ADD COLUMN can_manage_voting boolean NOT NULL DEFAULT false,
            ADD COLUMN can_resolve_draws boolean NOT NULL DEFAULT false;
        UPDATE public.karaoke_admin_accounts SET can_manage_voting = true, can_resolve_draws = true
        WHERE username = 'owner';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_admin_sign_in(account text, verifier text, token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    PERFORM 1 FROM public.karaoke_admin_accounts a
    WHERE a.username = account AND a.enabled
      AND CASE WHEN a.password_hash LIKE '$2a$%' THEN a.password_hash = extensions.crypt(verifier, a.password_hash)
               ELSE a.password_hash = verifier END
    FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
    DELETE FROM public.karaoke_admin_sessions WHERE expires_at <= clock_timestamp();
    INSERT INTO public.karaoke_admin_sessions (token_hash, username, expires_at)
    VALUES (token, account, clock_timestamp() + interval '8 hours');
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_admin_permissions(token text)
RETURNS TABLE (username text, can_manage_voting boolean, can_resolve_draws boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    SELECT a.username, a.can_manage_voting, a.can_resolve_draws
    FROM public.karaoke_admin_sessions s
    JOIN public.karaoke_admin_accounts a ON a.username = s.username
    WHERE s.token_hash = token AND s.expires_at > clock_timestamp() AND a.enabled
    FOR SHARE OF a, s;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_admin_switch(token text, expected uuid, opening boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    actor text;
    current_round uuid;
    closing_at timestamptz;
BEGIN
    SELECT p.username INTO actor FROM public.karaoke_admin_permissions(token) p WHERE p.can_manage_voting;
    IF actor IS NULL THEN RETURN false; END IF;
    SELECT round_id, closes_at INTO current_round, closing_at FROM public.karaoke_2026_state FOR UPDATE;
    IF NOT opening AND (closing_at IS NULL OR closing_at <= clock_timestamp()) THEN RETURN false; END IF;
    IF NOT public.karaoke_2026_switch(expected, opening) THEN RETURN false; END IF;
    SELECT round_id INTO current_round FROM public.karaoke_2026_state;
    INSERT INTO public.karaoke_admin_audit (username, action, round_id)
    VALUES (actor, CASE WHEN opening THEN 'open' ELSE 'close' END, current_round);
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_admin_draw(token text, expected uuid, prior jsonb,
    step text, candidates jsonb, selected jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor text;
BEGIN
    SELECT p.username INTO actor FROM public.karaoke_admin_permissions(token) p WHERE p.can_resolve_draws;
    IF actor IS NULL OR NOT public.karaoke_2026_record_draw(expected, prior, step, candidates, selected) THEN
        RETURN false;
    END IF;
    INSERT INTO public.karaoke_admin_audit (username, action, round_id, detail)
    VALUES (actor, 'draw', expected, jsonb_build_object('step', step, 'candidates', candidates, 'selected', selected));
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.karaoke_admin_sign_in(text, text, text), public.karaoke_admin_permissions(text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.karaoke_admin_sign_in(text, text, text), public.karaoke_admin_permissions(text)
    TO karaoke_worker;

COMMIT;
