-- Game Write schema
-- Run this once against a fresh database (e.g. via cPanel phpMyAdmin).

CREATE TABLE IF NOT EXISTS location (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  x INT NOT NULL DEFAULT 0,
  y INT NOT NULL DEFAULT 0,
  size INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS npc (
  id INT AUTO_INCREMENT PRIMARY KEY,
  location_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  disposition INT NOT NULL DEFAULT 0,
  openness INT NOT NULL DEFAULT 5,
  conscientiousness INT NOT NULL DEFAULT 5,
  extraversion INT NOT NULL DEFAULT 5,
  agreeableness INT NOT NULL DEFAULT 5,
  neuroticism INT NOT NULL DEFAULT 5,
  art VARCHAR(500) DEFAULT NULL,
  FOREIGN KEY (location_id) REFERENCES location(id) ON DELETE CASCADE
);

-- `call` is a MySQL reserved word, so it must stay backtick-quoted here and in queries.
CREATE TABLE IF NOT EXISTS response (
  id INT AUTO_INCREMENT PRIMARY KEY,
  npc_id INT NOT NULL,
  `call` TEXT NOT NULL,
  response TEXT NOT NULL,
  effect VARCHAR(255),
  FOREIGN KEY (npc_id) REFERENCES npc(id) ON DELETE CASCADE
);
