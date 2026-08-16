<?php
// Copy this file to config.php and fill in real values.
// config.php is gitignored - never commit real credentials.

define('DB_HOST', 'localhost');
define('DB_NAME', 'yourcpaneluser_gamewrite');
define('DB_USER', 'yourcpaneluser_dbuser');
define('DB_PASS', 'changeme');

// Shared password for friends helping write dialogue.
// Generate a hash with: php -r "echo password_hash('yourpassword', PASSWORD_DEFAULT), PHP_EOL;"
define('APP_PASSWORD_HASH', '$2y$10$replaceWithGeneratedHash');
