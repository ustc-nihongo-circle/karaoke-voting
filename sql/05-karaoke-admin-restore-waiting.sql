BEGIN;

ALTER TABLE public.karaoke_admin_audit
    DROP CONSTRAINT karaoke_admin_audit_action_check,
    ADD CONSTRAINT karaoke_admin_audit_action_check
        CHECK (action IN ('open', 'close', 'draw', 'restore_waiting'));

CREATE OR REPLACE FUNCTION public.karaoke_admin_restore_waiting(token text, expected uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor text;
BEGIN
    SELECT p.username INTO actor FROM public.karaoke_admin_permissions(token) p WHERE p.can_manage_voting;
    IF actor IS NULL THEN RETURN false; END IF;

    UPDATE public.karaoke_2026_state
    SET round_id = NULL, closes_at = NULL, draws = '{}'::jsonb
    WHERE id AND round_id = expected AND closes_at <= clock_timestamp();
    IF NOT FOUND THEN RETURN false; END IF;

    INSERT INTO public.karaoke_admin_audit (username, action, round_id)
    VALUES (actor, 'restore_waiting', expected);
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.karaoke_admin_restore_waiting(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.karaoke_admin_restore_waiting(text, uuid) TO karaoke_worker;

COMMIT;
