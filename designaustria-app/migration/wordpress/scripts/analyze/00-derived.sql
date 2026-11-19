-- Derived helper tables in a scratch schema. Rebuilt on every run.
-- The `wordpress` schema stays untouched.
DROP DATABASE IF EXISTS wp_analysis;
CREATE DATABASE wp_analysis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- member ↔ community links, normalised.
-- da_member_community / da_member_community_admin are stored either as a
-- PHP-serialised array of string IDs (a:1:{i:0;s:4:"2890";}) or, for older
-- rows, as a bare post ID ("2890"). Both forms are matched here.
CREATE TABLE wp_analysis.member_community AS
SELECT m.post_id AS member_id,
       c.ID      AS community_id,
       CAST(IF(m.meta_key = 'da_member_community_admin', 'admin', 'member') AS CHAR(10)) COLLATE utf8mb4_unicode_ci AS kind
FROM wordpress.wp_postmeta m
-- only real member posts: revisions also carry ACF meta and would be counted otherwise
JOIN wordpress.wp_posts mp ON mp.ID = m.post_id AND mp.post_type = 'member'
JOIN wordpress.wp_posts c
  ON c.post_type = 'community'
 AND (m.meta_value = CAST(c.ID AS CHAR) COLLATE utf8mb4_unicode_ci
      OR m.meta_value LIKE CONCAT('%"', c.ID, '";%') COLLATE utf8mb4_unicode_ci)
WHERE m.meta_key IN ('da_member_community', 'da_member_community_admin');

SELECT kind, COUNT(*) AS links FROM wp_analysis.member_community GROUP BY kind;
