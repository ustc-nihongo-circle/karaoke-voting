BEGIN;

CREATE TABLE IF NOT EXISTS public.karaoke_staff_permission_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor text NOT NULL REFERENCES public.karaoke_admin_accounts(username),
    target text NOT NULL REFERENCES public.karaoke_admin_accounts(username),
    before_permissions jsonb NOT NULL,
    after_permissions jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.karaoke_staff_permission_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.karaoke_staff_list(token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE accounts jsonb;
BEGIN
    IF public.karaoke_admin_actor(token) IS DISTINCT FROM 'owner' THEN RETURN NULL; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('username', a.username, 'enabled', a.enabled,
        'manageVoting', a.can_manage_voting, 'resolveDraws', a.can_resolve_draws) ORDER BY a.username), '[]'::jsonb)
    INTO accounts FROM public.karaoke_admin_accounts a;
    RETURN accounts;
END;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_staff_update_permissions(token text, account text,
    before_voting boolean, before_draws boolean, after_voting boolean, after_draws boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF public.karaoke_admin_actor(token) IS DISTINCT FROM 'owner' OR account IN ('owner', 'staff_public') THEN
        RETURN false;
    END IF;
    UPDATE public.karaoke_admin_accounts a
    SET can_manage_voting = after_voting, can_resolve_draws = after_draws
    WHERE a.username = account AND a.enabled
      AND a.can_manage_voting = before_voting AND a.can_resolve_draws = before_draws;
    IF NOT FOUND THEN RETURN false; END IF;
    IF (before_voting, before_draws) IS DISTINCT FROM (after_voting, after_draws) THEN
        INSERT INTO public.karaoke_staff_permission_audit (actor, target, before_permissions, after_permissions)
        VALUES ('owner', account, jsonb_build_object('manageVoting', before_voting, 'resolveDraws', before_draws),
            jsonb_build_object('manageVoting', after_voting, 'resolveDraws', after_draws));
    END IF;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.karaoke_staff_list(text),
    public.karaoke_staff_update_permissions(text, text, boolean, boolean, boolean, boolean)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.karaoke_staff_list(text),
    public.karaoke_staff_update_permissions(text, text, boolean, boolean, boolean, boolean)
TO karaoke_worker;

COMMIT;
