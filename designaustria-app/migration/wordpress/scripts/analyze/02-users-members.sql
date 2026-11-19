-- WP users ↔ member profiles (CPT `member`, ACF field da_member_user).

SELECT 'members total' AS k, COUNT(*) AS v FROM wp_posts WHERE post_type = 'member'
UNION ALL SELECT 'members with da_member_user set', COUNT(*)
  FROM wp_posts p JOIN wp_postmeta m ON m.post_id = p.ID AND m.meta_key = 'da_member_user' AND m.meta_value <> ''
  WHERE p.post_type = 'member'
UNION ALL SELECT 'members whose linked user exists', COUNT(*)
  FROM wp_posts p JOIN wp_postmeta m ON m.post_id = p.ID AND m.meta_key = 'da_member_user'
  JOIN wp_users u ON u.ID = m.meta_value WHERE p.post_type = 'member'
UNION ALL SELECT 'users total', COUNT(*) FROM wp_users
UNION ALL SELECT 'users without member profile', COUNT(*) FROM wp_users u
  WHERE NOT EXISTS (SELECT 1 FROM wp_postmeta l WHERE l.meta_key = 'da_member_user' AND l.meta_value = u.ID);

-- Users linked to more than one member post (0 = bogus value)
SELECT m.meta_value AS user_id, COUNT(*) AS n, GROUP_CONCAT(CONCAT(p.ID, ':', p.post_status)) AS member_posts
FROM wp_postmeta m JOIN wp_posts p ON p.ID = m.post_id AND p.post_type = 'member'
WHERE m.meta_key = 'da_member_user' AND m.meta_value <> ''
GROUP BY 1 HAVING n > 1;

-- Users without a member profile, by role
SELECT c.meta_value AS role, COUNT(*) AS n,
       SUM(EXISTS (SELECT 1 FROM wp_postmeta o WHERE o.meta_key = '_customer_user' AND o.meta_value = u.ID)) AS with_orders
FROM wp_users u JOIN wp_usermeta c ON c.user_id = u.ID AND c.meta_key = 'wp_capabilities'
WHERE NOT EXISTS (SELECT 1 FROM wp_postmeta l WHERE l.meta_key = 'da_member_user' AND l.meta_value = u.ID)
GROUP BY 1;

-- post_status × membership status flags (da_member_status is a multi-checkbox)
SELECT p.post_status,
  SUM(s.meta_value LIKE '%"standard"%')   AS standard,
  SUM(s.meta_value LIKE '%"yp"%')         AS yp,
  SUM(s.meta_value LIKE '%"student"%')    AS student,
  SUM(s.meta_value LIKE '%"retiree"%')    AS retiree,
  SUM(s.meta_value LIKE '%"community"%')  AS community,
  SUM(s.meta_value LIKE '%"institute"%')  AS institute,
  SUM(s.meta_value LIKE '%"honorary"%')   AS honorary,
  SUM(s.meta_value LIKE '%"president"%')  AS president,
  SUM(s.meta_value LIKE '%"team"%')       AS team,
  SUM(s.meta_value LIKE '%"board"%')      AS board,
  SUM(s.meta_value LIKE '%"bildrecht"%')  AS bildrecht,
  SUM(s.meta_value LIKE '%"newsletter"%') AS newsletter,
  SUM(s.meta_value LIKE '%"active"%')     AS active_legacy,
  SUM(s.meta_value IS NULL OR s.meta_value IN ('', 'a:0:{}')) AS none,
  COUNT(*) AS total,
  SUM(u.meta_value IS NOT NULL AND u.meta_value <> '') AS has_user,
  SUM(d.meta_value IS NOT NULL AND d.meta_value NOT IN ('', '0')) AS deceased
FROM wp_posts p
LEFT JOIN wp_postmeta s ON s.post_id = p.ID AND s.meta_key = 'da_member_status'
LEFT JOIN wp_postmeta u ON u.post_id = p.ID AND u.meta_key = 'da_member_user'
LEFT JOIN wp_postmeta d ON d.post_id = p.ID AND d.meta_key = 'da_member_deathyear'
WHERE p.post_type = 'member' GROUP BY 1;

-- Raw status combinations
SELECT meta_value AS status, COUNT(*) AS n
FROM wp_postmeta m JOIN wp_posts p ON p.ID = m.post_id AND p.post_type = 'member'
WHERE meta_key = 'da_member_status' GROUP BY 1 ORDER BY n DESC;

-- Member field fill rate (top-level ACF fields; repeater sub-rows excluded)
SELECT m.meta_key, COUNT(*) AS filled
FROM wp_postmeta m JOIN wp_posts p ON p.ID = m.post_id AND p.post_type = 'member'
WHERE m.meta_key LIKE 'da\_%' AND m.meta_key NOT REGEXP '_[0-9]+_'
  AND m.meta_value NOT IN ('', 'a:0:{}', '0')
GROUP BY 1 ORDER BY filled DESC;

-- Mitgliedsnummer format & duplicates
SELECT LENGTH(meta_value) AS len, MIN(meta_value), MAX(meta_value), COUNT(*)
FROM wp_postmeta WHERE meta_key = 'da_member_id' GROUP BY 1;
SELECT meta_value AS da_member_id, COUNT(*) AS n, GROUP_CONCAT(post_id) AS member_posts
FROM wp_postmeta m JOIN wp_posts p ON p.ID = m.post_id AND p.post_type = 'member'
WHERE meta_key = 'da_member_id' AND meta_value <> '' GROUP BY 1 HAVING n > 1;

-- Legacy keys not in current ACF definitions
SELECT p.post_status, k.meta_key, LEFT(k.meta_value, 40) AS v, COUNT(*) AS n
FROM wp_posts p JOIN wp_postmeta k ON k.post_id = p.ID
WHERE p.post_type = 'member' AND k.meta_key IN ('da_member_display', 'da_member_motivation', 'da_new_notified')
GROUP BY 1, 2, 3 ORDER BY 2, 1;

-- Attachments referenced from profiles
SELECT m.meta_key, COUNT(*) AS refs, SUM(a.ID IS NOT NULL) AS attachment_exists
FROM wp_postmeta m
JOIN wp_posts p ON p.ID = m.post_id AND p.post_type IN ('member', 'community')
LEFT JOIN wp_posts a ON a.ID = m.meta_value AND a.post_type = 'attachment'
WHERE m.meta_key IN ('da_member_avatar', 'da_community_logo', 'da_member_cert', '_thumbnail_id') AND m.meta_value <> ''
GROUP BY 1;
