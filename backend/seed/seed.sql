TRUNCATE contacts, tags RESTART IDENTITY CASCADE;

INSERT INTO tags (name) VALUES ('Lead'),('Customer'),('VIP'),('Prospect'),('Partner'),('Churned');

WITH names AS (
  SELECT
    ARRAY['Aarav','Vivaan','Aditya','Arjun','Rahul','Rohan','Karan','Vikram','Amit','Sanjay','Priya','Ananya','Diya','Isha','Neha','Pooja','Riya','Sneha','Kavya','Meera',
          'James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William','Elizabeth','David','Susan','Richard','Jessica','Joseph','Sarah','Thomas','Karen','Daniel','Emma',
          'Liam','Olivia','Noah','Sophia','Lucas','Mia','Ethan','Chloe','Hiro','Yuki'] AS firsts,
    ARRAY['Sharma','Verma','Gupta','Singh','Patel','Reddy','Iyer','Nair','Mehta','Joshi','Kumar','Das','Bose','Khan','Shah','Rao','Desai','Kapoor','Malhotra','Chopra',
          'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Anderson','Taylor','Moore','Martin','Lee','Clark','Lewis','Walker','Hall','Young','King',
          'Tanaka','Suzuki','Muller','Rossi','Dubois','Silva','Kim','Chen','Nguyen','Cohen'] AS lasts,
    ARRAY['Acme','Globex','Initech','Umbrella','Hooli','Stark Industries','Wayne Enterprises','Wonka','Tyrell','Cyberdyne',
          'Soylent','Vandelay','Pied Piper','Aperture','Black Mesa','Massive Dynamic','Oscorp','Gringotts','Dunder Mifflin','Sterling Cooper',
          'Infosys','Tata Consultancy','Wipro','Zoho','Freshworks','Razorpay','Flipkart','Swiggy','Zomato','Paytm',
          'Reliance','Mahindra','Godrej','Bajaj','Hindustan Unilever','Asian Paints','Titan','Nykaa','Ola','Meesho'] AS companies
), gen AS (
  SELECT n,
    firsts[1 + (random()*49)::int] AS first_name,
    lasts[1 + (random()*49)::int]  AS last_name,
    companies[1 + (random()*39)::int] AS company,
    random() AS r_email, random() AS r_phone, random() AS r_company,
    -- every 50th row shares its timestamp with the previous one -> exercises the id tie-breaker
    CASE WHEN n % 50 = 0 THEN n - 1 ELSE n END AS ts_n
  FROM names, generate_series(1, 200000) AS n
)
INSERT INTO contacts (first_name, last_name, email, phone, company, created_at, updated_at)
SELECT first_name, last_name,
  CASE WHEN r_email < 0.05 THEN NULL ELSE lower(first_name || '.' || last_name || '.' || n || '@example.com') END,
  CASE WHEN r_phone < 0.05 THEN NULL ELSE '+91' || lpad((6000000000 + (n::bigint * 7919) % 4000000000)::text, 10, '0') END,
  CASE WHEN r_company < 0.1 THEN NULL ELSE company END,
  ts, ts
FROM gen
CROSS JOIN LATERAL (SELECT date_trunc('second', now() - interval '2 years' + (ts_n::numeric / 200000) * interval '2 years') AS ts) t
ORDER BY n;

-- 0-3 random distinct tags per contact
INSERT INTO contact_tags (contact_id, tag_id)
SELECT DISTINCT c.id, 1 + (random()*5)::int
FROM contacts c, generate_series(1, 3) g
WHERE random() < 0.5;

INSERT INTO contact_activities (contact_id, type, data)
SELECT c.id, 'CONTACT_UPDATED', jsonb_build_object('changed', jsonb_build_object('company', jsonb_build_object('from', NULL, 'to', 'Acme')))
FROM contacts c WHERE c.id <= 50;
INSERT INTO contact_activities (contact_id, type, data)
SELECT c.id, 'TAG_ADDED', jsonb_build_object('tag', 'Lead') FROM contacts c WHERE c.id <= 50;

ANALYZE;
