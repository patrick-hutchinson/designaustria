-- WooCommerce. Orders use legacy post storage (shop_order in wp_posts);
-- the HPOS tables (wp_wc_orders*) are empty.

SELECT 'wp_wc_orders rows (HPOS)' AS k, COUNT(*) AS v FROM wp_wc_orders
UNION ALL SELECT 'shop_order posts', COUNT(*) FROM wp_posts WHERE post_type = 'shop_order'
UNION ALL SELECT 'shop_order_refund posts', COUNT(*) FROM wp_posts WHERE post_type = 'shop_order_refund'
UNION ALL SELECT 'products', COUNT(*) FROM wp_posts WHERE post_type = 'product'
UNION ALL SELECT 'download permissions', COUNT(*) FROM wp_woocommerce_downloadable_product_permissions;

SELECT YEAR(post_date) AS year, post_status, COUNT(*) AS orders
FROM wp_posts WHERE post_type = 'shop_order' GROUP BY 1, 2 ORDER BY 1, 3 DESC;

-- Registered vs guest
SELECT IF(cu.meta_value IS NULL OR cu.meta_value = '0', 'guest', 'registered') AS customer, COUNT(*) AS orders
FROM wp_posts o LEFT JOIN wp_postmeta cu ON cu.post_id = o.ID AND cu.meta_key = '_customer_user'
WHERE o.post_type = 'shop_order' GROUP BY 1;

SELECT COUNT(*) AS distinct_buyers,
       SUM(EXISTS (SELECT 1 FROM wp_postmeta l WHERE l.meta_key = 'da_member_user' AND l.meta_value = b.uid)) AS buyers_with_member_profile
FROM (SELECT DISTINCT meta_value AS uid FROM wp_postmeta WHERE meta_key = '_customer_user' AND meta_value <> '0') b;

-- Free orders (event registrations)
SELECT o.post_status, SUM(t.meta_value + 0 = 0) AS zero_total, COUNT(*) AS total
FROM wp_posts o JOIN wp_postmeta t ON t.post_id = o.ID AND t.meta_key = '_order_total'
WHERE o.post_type = 'shop_order' GROUP BY 1;

SELECT meta_value AS payment_method, COUNT(*) AS n FROM wp_postmeta WHERE meta_key = '_payment_method_title' GROUP BY 1;

SELECT order_item_type, COUNT(*) AS n FROM wp_woocommerce_order_items GROUP BY 1;

-- What is sold
SELECT order_item_name, COUNT(*) AS lines FROM wp_woocommerce_order_items
WHERE order_item_type = 'line_item' GROUP BY 1 ORDER BY lines DESC LIMIT 30;

-- Product flags
SELECT m.meta_key, m.meta_value, COUNT(*) AS n
FROM wp_postmeta m JOIN wp_posts p ON p.ID = m.post_id AND p.post_type = 'product'
WHERE meta_key IN ('_virtual', '_downloadable', '_manage_stock') GROUP BY 1, 2;

-- Products referenced from publications/events (ACF da_product)
SELECT p.post_type, COUNT(*) AS n FROM wp_postmeta m JOIN wp_posts p ON p.ID = m.post_id
WHERE m.meta_key = 'da_product' AND m.meta_value <> '' GROUP BY 1;

-- Regular vs sale price (sale ≈ 50%: suspected member price)
SELECT p.ID, p.post_title, r.meta_value AS regular, s.meta_value AS sale,
       ROUND(s.meta_value / NULLIF(r.meta_value, 0), 2) AS ratio
FROM wp_posts p
JOIN wp_postmeta r ON r.post_id = p.ID AND r.meta_key = '_regular_price'
JOIN wp_postmeta s ON s.post_id = p.ID AND s.meta_key = '_sale_price' AND s.meta_value <> ''
WHERE p.post_type = 'product' ORDER BY ratio LIMIT 200;

-- Order meta keys in use
SELECT m.meta_key, COUNT(*) AS n FROM wp_postmeta m JOIN wp_posts o ON o.ID = m.post_id AND o.post_type = 'shop_order'
GROUP BY 1 ORDER BY n DESC;
