CREATE TABLE public.community_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  creator text NOT NULL CHECK (char_length(creator) BETWEEN 1 AND 24),
  theme text NOT NULL CHECK (char_length(theme) <= 20),
  data jsonb NOT NULL CHECK (pg_column_size(data) < 60000),
  plays integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.community_tracks TO anon, authenticated;
GRANT ALL ON public.community_tracks TO service_role;
ALTER TABLE public.community_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view community tracks" ON public.community_tracks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can publish a track" ON public.community_tracks FOR INSERT TO anon, authenticated WITH CHECK (plays = 0);
CREATE INDEX community_tracks_created_idx ON public.community_tracks (created_at DESC);