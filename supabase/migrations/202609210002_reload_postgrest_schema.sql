-- Make the newly created checkout claim table immediately visible to the
-- Supabase Data API in every environment where the preceding migration runs.
notify pgrst, 'reload schema';
