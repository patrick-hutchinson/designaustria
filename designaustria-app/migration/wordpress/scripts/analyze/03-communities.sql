-- Communities (CPT `community`) = organisations/companies/schools.
-- Requires wp_analysis.member_community from 00-derived.sql.

SELECT p.post_status, s.meta_value AS community_status, COUNT(*) AS n
FROM wp_posts p LEFT JOIN wp_postmeta s ON s.post_id = p.ID AND s.meta_key = 'da_community_status'
WHERE p.post_type = 'community' GROUP BY 1, 2;

SELECT kind, COUNT(*) AS links, COUNT(DISTINCT member_id) AS members, COUNT(DISTINCT community_id) AS communities
FROM wp_analysis.member_community GROUP BY kind;

SELECT 'admins not also member of same community' AS k, COUNT(*) AS v
  FROM wp_analysis.member_community a WHERE kind = 'admin'
  AND NOT EXISTS (SELECT 1 FROM wp_analysis.member_community b
                  WHERE b.kind = 'member' AND b.member_id = a.member_id AND b.community_id = a.community_id)
UNION ALL SELECT 'communities without admin (all statuses)', COUNT(*) FROM wp_posts c
  WHERE c.post_type = 'community' AND c.ID NOT IN (SELECT community_id FROM wp_analysis.member_community WHERE kind = 'admin')
UNION ALL SELECT 'published communities without admin', COUNT(*) FROM wp_posts c
  WHERE c.post_type = 'community' AND c.post_status = 'publish'
  AND c.ID NOT IN (SELECT community_id FROM wp_analysis.member_community WHERE kind = 'admin')
UNION ALL SELECT 'published communities without any linked member', COUNT(*) FROM wp_posts c
  WHERE c.post_type = 'community' AND c.post_status = 'publish'
  AND c.ID NOT IN (SELECT community_id FROM wp_analysis.member_community)
UNION ALL SELECT 'admin links whose member has a WP user', COUNT(*) FROM wp_analysis.member_community r
  JOIN wp_postmeta u ON u.post_id = r.member_id AND u.meta_key = 'da_member_user' AND u.meta_value <> ''
  WHERE kind = 'admin'
UNION ALL SELECT 'members in >1 community', COUNT(*) FROM (
  SELECT member_id FROM wp_analysis.member_community WHERE kind = 'member'
  GROUP BY member_id HAVING COUNT(DISTINCT community_id) > 1) x
UNION ALL SELECT 'admins of >1 community', COUNT(*) FROM (
  SELECT member_id FROM wp_analysis.member_community WHERE kind = 'admin'
  GROUP BY member_id HAVING COUNT(DISTINCT community_id) > 1) x
UNION ALL SELECT 'members with status=community but no community link', COUNT(*)
  FROM wp_postmeta s JOIN wp_posts p ON p.ID = s.post_id AND p.post_type = 'member'
  WHERE s.meta_key = 'da_member_status' AND s.meta_value LIKE '%"community"%'
  AND s.post_id NOT IN (SELECT member_id FROM wp_analysis.member_community);

-- Distribution: distinct people per community
SELECT n AS people, COUNT(*) AS communities FROM (
  SELECT community_id, COUNT(DISTINCT member_id) AS n FROM wp_analysis.member_community GROUP BY community_id) x
GROUP BY n ORDER BY n;

-- Largest communities
SELECT c.ID, c.post_status, nm.meta_value AS name, st.meta_value AS status,
       COUNT(DISTINCT r.member_id) AS people, SUM(r.kind = 'admin') AS admins
FROM wp_analysis.member_community r
JOIN wp_posts c ON c.ID = r.community_id
LEFT JOIN wp_postmeta nm ON nm.post_id = c.ID AND nm.meta_key = 'da_community_name'
LEFT JOIN wp_postmeta st ON st.post_id = c.ID AND st.meta_key = 'da_community_status'
GROUP BY c.ID ORDER BY people DESC LIMIT 10;

-- Membership status of admins vs. plain linked members
SELECT 'admin' AS kind, s.meta_value AS status, COUNT(*) AS n
FROM wp_analysis.member_community r LEFT JOIN wp_postmeta s ON s.post_id = r.member_id AND s.meta_key = 'da_member_status'
WHERE kind = 'admin' GROUP BY 2
UNION ALL
SELECT 'member-only', s.meta_value, COUNT(*)
FROM wp_analysis.member_community r LEFT JOIN wp_postmeta s ON s.post_id = r.member_id AND s.meta_key = 'da_member_status'
WHERE kind = 'member' AND r.member_id NOT IN (SELECT member_id FROM wp_analysis.member_community WHERE kind = 'admin')
GROUP BY 2 ORDER BY 1, 3 DESC;

-- Who authored community posts (all WP admins → communities have no own login)
SELECT um.meta_value AS author_role, COUNT(*) AS n
FROM wp_posts p LEFT JOIN wp_usermeta um ON um.user_id = p.post_author AND um.meta_key = 'wp_capabilities'
WHERE p.post_type = 'community' GROUP BY 1;
