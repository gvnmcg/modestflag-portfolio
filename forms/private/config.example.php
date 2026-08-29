<?php
// Copy this file to config.php and fill in real values.
// config.php is gitignored - never commit real credentials.

define('SMTP_HOST', 'smtp.example.com');
define('SMTP_PORT', 587); // 587 = STARTTLS, 465 = implicit TLS
define('SMTP_SECURE', 'tls'); // 'tls' or 'ssl'
define('SMTP_USER', 'you@example.com');
define('SMTP_PASS', 'changeme');

define('MAIL_FROM', 'noreply@soulacupunctureclinic.com');
define('MAIL_FROM_NAME', 'Soul Acupuncture Clinic Website');
define('MAIL_TO', 'clinic@example.com');
