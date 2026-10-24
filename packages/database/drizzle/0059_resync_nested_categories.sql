-- GameBanana nests some categories three levels deep (Skins > hero >
-- Faithful/Vanilla+, Model Replacement > NPCs > Troopers), and the sync filed
-- those mods under the middle level. Clearing the index revision makes the next
-- sync re-read them with their root category and hero. Rows no longer listed on
-- GameBanana are left as they are.
UPDATE "mod" SET "remote_index_modified_at" = NULL
WHERE NOT "is_audio"
	AND "category" NOT IN ('Animations', 'Gameplay Modifications', 'HUD', 'Maps', 'Model Replacement', 'Other/Misc', 'Quality of Life/Fixes', 'Skins');
