BEGIN;

CREATE TABLE IF NOT EXISTS public.karaoke_admin_accounts (
    username text PRIMARY KEY,
    password_hash text NOT NULL,
    enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.karaoke_admin_sessions (
    token_hash text PRIMARY KEY,
    username text NOT NULL REFERENCES public.karaoke_admin_accounts(username),
    expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.karaoke_admin_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL REFERENCES public.karaoke_admin_accounts(username),
    action text NOT NULL CHECK (action IN ('open', 'close', 'draw')),
    round_id uuid NOT NULL REFERENCES public.karaoke_2026_rounds(id),
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.karaoke_admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.karaoke_admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.karaoke_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.karaoke_admin_login(account text, verifier text, token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    PERFORM 1 FROM public.karaoke_admin_accounts a
    WHERE a.username = account AND a.enabled AND a.password_hash = verifier FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
    DELETE FROM public.karaoke_admin_sessions WHERE expires_at <= clock_timestamp();
    INSERT INTO public.karaoke_admin_sessions (token_hash, username, expires_at)
    VALUES (token, account, clock_timestamp() + interval '8 hours');
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_admin_actor(token text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    SELECT a.username FROM public.karaoke_admin_sessions s
    JOIN public.karaoke_admin_accounts a ON a.username = s.username
    WHERE s.token_hash = token AND s.expires_at > clock_timestamp() AND a.enabled
    FOR SHARE OF a, s;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_admin_logout(token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    DELETE FROM public.karaoke_admin_sessions WHERE token_hash = token;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_admin_switch(token text, expected uuid, opening boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    actor text := public.karaoke_admin_actor(token);
    current_round uuid;
    closing_at timestamptz;
BEGIN
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
DECLARE actor text := public.karaoke_admin_actor(token);
BEGIN
    IF actor IS NULL OR NOT public.karaoke_2026_record_draw(expected, prior, step, candidates, selected) THEN
        RETURN false;
    END IF;
    INSERT INTO public.karaoke_admin_audit (username, action, round_id, detail)
    VALUES (actor, 'draw', expected, jsonb_build_object('step', step, 'candidates', candidates, 'selected', selected));
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.karaoke_admin_login(text, text, text), public.karaoke_admin_actor(text),
    public.karaoke_admin_logout(text), public.karaoke_admin_switch(text, uuid, boolean),
    public.karaoke_admin_draw(text, uuid, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.karaoke_admin_login(text, text, text), public.karaoke_admin_actor(text),
    public.karaoke_admin_logout(text), public.karaoke_admin_switch(text, uuid, boolean),
    public.karaoke_admin_draw(text, uuid, jsonb, text, jsonb, jsonb) TO karaoke_worker;

COMMIT;
