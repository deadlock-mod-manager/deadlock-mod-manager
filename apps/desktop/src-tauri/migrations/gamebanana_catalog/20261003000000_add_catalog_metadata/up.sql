ALTER TABLE submission ADD COLUMN audio_url TEXT;
ALTER TABLE submission ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE submission ADD COLUMN development_state TEXT;
ALTER TABLE submission ADD COLUMN completion_percentage INTEGER;
