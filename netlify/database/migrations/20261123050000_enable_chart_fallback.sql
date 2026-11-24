UPDATE content_docs
SET data = jsonb_set(
  data,
  '{widgets}',
  COALESCE(data->'widgets', '{}'::jsonb) || jsonb_build_object(
    'chart_feed', COALESCE(data->'widgets'->'chart_feed', '{}'::jsonb) ||
      jsonb_build_object('enabled', true, 'fallback_last3_digits', true, 'reconcile_on_api', true)
  ),
  true
)
WHERE collection = 'settings' AND id = 'site';
