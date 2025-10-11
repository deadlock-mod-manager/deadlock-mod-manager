
-- Insert default segments
-- Core Contributors (rank 1 = highest priority)
INSERT INTO segments (id, name, description, rank, created_at, updated_at)
VALUES (
  'segment_01jfg0000000000000000core',
  'core-contributors',
  'Core contributors and maintainers with highest priority access to features',
  1,
  NOW(),
  NOW()
) ON CONFLICT (name) DO NOTHING;

-- Beta Users (rank 2 = lower priority than core contributors)
INSERT INTO segments (id, name, description, rank, created_at, updated_at)
VALUES (
  'segment_01jfg0000000000000000beta',
  'beta-users',
  'Beta testers with early access to new features',
  2,
  NOW(),
  NOW()
) ON CONFLICT (name) DO NOTHING;