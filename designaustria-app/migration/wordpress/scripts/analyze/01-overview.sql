-- Overall shape: post types, roles, taxonomies.

SELECT post_type, post_status, COUNT(*) AS n
FROM wp_posts GROUP BY 1, 2 ORDER BY 1, n DESC;

SELECT meta_value AS role, COUNT(*) AS users
FROM wp_usermeta WHERE meta_key = 'wp_capabilities' GROUP BY 1 ORDER BY users DESC;

SELECT taxonomy, COUNT(*) AS terms FROM wp_term_taxonomy GROUP BY 1 ORDER BY terms DESC;

SELECT YEAR(user_registered) AS year, COUNT(*) AS users_registered FROM wp_users GROUP BY 1;

SELECT LEFT(user_pass, 4) AS hash_prefix, COUNT(*) AS n FROM wp_users GROUP BY 1;

-- ACF field definitions (name, label, group). Field type/choices live in post_content (serialised).
SELECT g.post_title AS field_group, f.post_excerpt AS field_name, f.post_title AS label, f.post_parent AS parent
FROM wp_posts f
LEFT JOIN wp_posts g ON g.ID = f.post_parent AND g.post_type = 'acf-field-group'
WHERE f.post_type = 'acf-field'
ORDER BY f.post_parent, f.menu_order;
