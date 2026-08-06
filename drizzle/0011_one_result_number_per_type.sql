WITH normalized AS (
  SELECT p."workspace", p."id", COALESCE((
    SELECT jsonb_agg(d.link ORDER BY d.ordinality)
    FROM (
      SELECT DISTINCT ON (entry.link ->> 'type') entry.link, entry.ordinality
      FROM jsonb_array_elements(p."result_links") WITH ORDINALITY AS entry(link, ordinality)
      WHERE entry.link ->> 'type' IN ('wtg', 'road', 'servitude', 'substation')
        AND NULLIF(btrim(entry.link ->> 'number'), '') IS NOT NULL
      ORDER BY entry.link ->> 'type', entry.ordinality
    ) AS d
  ), '[]'::jsonb) AS result_links
  FROM "plot" AS p
)
UPDATE "plot" AS p
SET "result_links" = normalized.result_links
FROM normalized
WHERE p."workspace" = normalized."workspace"
  AND p."id" = normalized."id"
  AND p."result_links" IS DISTINCT FROM normalized.result_links;
