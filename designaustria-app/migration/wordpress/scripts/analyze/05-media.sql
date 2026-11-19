-- Attachments referenced by members and communities, and how to reach them on production.
-- Files live at https://www.designaustria.at/wp-content/uploads/<_wp_attached_file> (flat, no yyyy/mm).

SELECT CASE WHEN meta_value LIKE 'woocommerce_uploads/%' THEN 'woocommerce_uploads/'
            WHEN meta_value REGEXP '^[0-9]{4}/[0-9]{2}/' THEN 'yyyy/mm/'
            WHEN meta_value LIKE '%/%' THEN 'other subdir'
            ELSE 'flat' END AS path_shape, COUNT(*) AS n
FROM wp_postmeta WHERE meta_key = '_wp_attached_file' GROUP BY 1;

-- Expand every reference (single id, serialised id array) into one row per attachment.
DROP TABLE IF EXISTS wp_analysis.profile_files;
CREATE TABLE wp_analysis.profile_files AS
WITH RECURSIVE src AS (
  SELECT p.post_type AS owner_type, m.post_id AS owner_id,
    CASE WHEN m.meta_key IN ('da_member_avatar', 'da_community_logo', '_thumbnail_id') THEN 'image'
         WHEN m.meta_key = 'da_member_cert' THEN 'cert'
         WHEN m.meta_key REGEXP '^da_documents_[0-9]+_da_document$' THEN 'document'
         WHEN m.meta_key REGEXP '^da_portfolio_[0-9]+_da_portfolio_gallery$' THEN 'portfolio' END AS role,
    m.meta_value AS v
  FROM wp_postmeta m JOIN wp_posts p ON p.ID = m.post_id AND p.post_type IN ('member', 'community')
  WHERE (m.meta_key IN ('da_member_avatar', 'da_community_logo', '_thumbnail_id', 'da_member_cert')
         OR m.meta_key REGEXP '^da_documents_[0-9]+_da_document$'
         OR m.meta_key REGEXP '^da_portfolio_[0-9]+_da_portfolio_gallery$')
    AND m.meta_value NOT IN ('', '0', 'a:0:{}')
), nums AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM nums WHERE n < 200)
SELECT DISTINCT owner_type, owner_id, role,
  CAST(REPLACE(IF(v REGEXP '^[0-9]+$', v, REGEXP_SUBSTR(v, '"[0-9]+"', 1, n)), '"', '') AS UNSIGNED) AS attachment_id
FROM src JOIN nums
  ON n <= IF(v REGEXP '^[0-9]+$', 1, CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(v, ':', 2), ':', -1) AS UNSIGNED));

SELECT f.role, f.owner_type, COUNT(*) AS refs, COUNT(DISTINCT f.attachment_id) AS files,
       SUM(a.ID IS NULL) AS missing_attachment,
       SUM(a.post_mime_type LIKE 'image/%') AS images, SUM(a.post_mime_type = 'application/pdf') AS pdfs
FROM wp_analysis.profile_files f
LEFT JOIN wp_posts a ON a.ID = f.attachment_id AND a.post_type = 'attachment'
GROUP BY 1, 2;

-- Size estimate (WP ≥ 6.0 records filesize in the metadata; older uploads don't)
SELECT f.role, COUNT(*) AS files, SUM(md.meta_value LIKE '%"filesize"%') AS with_size,
  ROUND(SUM(CAST(REGEXP_SUBSTR(REGEXP_SUBSTR(md.meta_value, 's:8:"filesize";i:[0-9]+'), '[0-9]+$') AS UNSIGNED)) / 1024 / 1024) AS mb_known
FROM (SELECT DISTINCT role, attachment_id FROM wp_analysis.profile_files) f
LEFT JOIN wp_postmeta md ON md.post_id = f.attachment_id AND md.meta_key = '_wp_attachment_metadata'
GROUP BY 1;

SELECT 'downscaled images with original_image' AS k, COUNT(DISTINCT f.attachment_id) AS n
FROM wp_analysis.profile_files f
JOIN wp_postmeta md ON md.post_id = f.attachment_id AND md.meta_key = '_wp_attachment_metadata'
 AND md.meta_value LIKE '%original_image%';
