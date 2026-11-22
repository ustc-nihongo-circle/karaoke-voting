BEGIN;

CREATE TABLE IF NOT EXISTS public.karaoke_2026_state (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    round_id uuid,
    closes_at timestamptz,
    draws jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO public.karaoke_2026_state (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.karaoke_2026_rounds (
    id uuid PRIMARY KEY,
    opened_at timestamptz NOT NULL,
    closes_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.karaoke_2026_ballots (
    round_id uuid NOT NULL REFERENCES public.karaoke_2026_rounds(id),
    voter_id text NOT NULL,
    votes jsonb NOT NULL,
    PRIMARY KEY (round_id, voter_id)
);

CREATE TABLE IF NOT EXISTS public.karaoke_2026_draws (
    round_id uuid NOT NULL REFERENCES public.karaoke_2026_rounds(id),
    step text NOT NULL,
    candidates jsonb NOT NULL,
    selected jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (round_id, step)
);

ALTER TABLE public.karaoke_2026_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.karaoke_2026_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.karaoke_2026_ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.karaoke_2026_draws ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.karaoke_2026_read(voter text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    SELECT jsonb_build_object('round', s.round_id, 'closesAt', s.closes_at,
        'serverNow', clock_timestamp(), 'votes', b.votes)
    FROM public.karaoke_2026_state s
    LEFT JOIN public.karaoke_2026_ballots b ON b.round_id = s.round_id AND b.voter_id = voter;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_2026_save(voter text, expected uuid, choices jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE state public.karaoke_2026_state;
BEGIN
    SELECT * INTO STRICT state FROM public.karaoke_2026_state FOR SHARE;
    IF state.round_id IS NULL OR state.round_id IS DISTINCT FROM expected
        OR state.closes_at <= clock_timestamp() THEN
        RETURN false;
    END IF;
    INSERT INTO public.karaoke_2026_ballots (round_id, voter_id, votes)
    VALUES (state.round_id, voter, choices)
    ON CONFLICT (round_id, voter_id) DO UPDATE SET votes = EXCLUDED.votes;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_2026_switch(expected uuid, open_requested boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    state public.karaoke_2026_state;
    at_time timestamptz;
BEGIN
    SELECT * INTO STRICT state FROM public.karaoke_2026_state FOR UPDATE;
    IF state.round_id IS DISTINCT FROM expected THEN RETURN false; END IF;
    at_time := clock_timestamp();
    IF open_requested THEN
        IF state.closes_at > at_time THEN RETURN false; END IF;
        INSERT INTO public.karaoke_2026_rounds (id, opened_at, closes_at)
        VALUES (gen_random_uuid(), at_time, at_time + interval '10 minutes')
        RETURNING id, closes_at INTO state.round_id, state.closes_at;
        UPDATE public.karaoke_2026_state
        SET round_id = state.round_id, closes_at = state.closes_at, draws = '{}'::jsonb;
    ELSIF state.closes_at > at_time THEN
        UPDATE public.karaoke_2026_state SET closes_at = at_time;
        UPDATE public.karaoke_2026_rounds SET closes_at = at_time WHERE id = state.round_id;
    END IF;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_2026_tally()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    state public.karaoke_2026_state;
    counts jsonb;
BEGIN
    SELECT * INTO STRICT state FROM public.karaoke_2026_state FOR UPDATE;
    SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO counts FROM (
        SELECT category, entrant::integer AS id, count(*) AS votes
        FROM public.karaoke_2026_ballots b
        CROSS JOIN LATERAL jsonb_each(b.votes) v(category, choices)
        CROSS JOIN LATERAL jsonb_array_elements_text(v.choices) c(entrant)
        WHERE b.round_id = state.round_id
        GROUP BY category, entrant
    ) t;
    RETURN jsonb_build_object('round', state.round_id, 'closesAt', state.closes_at,
        'serverNow', clock_timestamp(), 'draws', state.draws, 'counts', counts);
END;
$$;

CREATE OR REPLACE FUNCTION public.karaoke_2026_record_draw(expected uuid, prior jsonb,
    step text, candidates jsonb, selected jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    UPDATE public.karaoke_2026_state SET draws = draws || jsonb_build_object(step, selected)
    WHERE round_id = expected AND draws = prior AND closes_at <= clock_timestamp();
    IF NOT FOUND THEN RETURN false; END IF;
    INSERT INTO public.karaoke_2026_draws (round_id, step, candidates, selected)
    VALUES (expected, step, candidates, selected);
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.karaoke_2026_read(text), public.karaoke_2026_save(text, uuid, jsonb),
    public.karaoke_2026_switch(uuid, boolean), public.karaoke_2026_tally(),
    public.karaoke_2026_record_draw(uuid, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.karaoke_2026_read(text), public.karaoke_2026_save(text, uuid, jsonb),
    public.karaoke_2026_switch(uuid, boolean), public.karaoke_2026_tally(),
    public.karaoke_2026_record_draw(uuid, jsonb, text, jsonb, jsonb) TO karaoke_worker;

COMMIT;
