SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'rw_%'
ORDER BY table_name;

SELECT extname
FROM pg_extension
WHERE extname = 'vector';