<?php
declare(strict_types=1);

require_once __DIR__ . '/private/config.php';
require_once __DIR__ . '/private/pdf.php';
require_once __DIR__ . '/private/smtp_mailer.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo 'Method not allowed';
    exit;
}

function humanize_field_name(string $key): string
{
    $label = str_replace(['-', '_'], ' ', $key);
    $label = preg_replace('/\s+/', ' ', trim($label));
    return ucwords((string) $label);
}

function format_field_value($value): string
{
    if (is_bool($value)) {
        return $value ? 'Yes' : 'No';
    }
    if (is_array($value)) {
        return implode(', ', array_map('strval', $value));
    }
    return trim((string) $value);
}

$fields = [];
if (isset($_POST['payload_json'])) {
    $decoded = json_decode((string) $_POST['payload_json'], true);
    if (is_array($decoded)) {
        $fields = $decoded;
    }
}
if (empty($fields)) {
    $fields = $_POST;
    unset($fields['payload_json']);
}

if (empty($fields)) {
    http_response_code(400);
    echo 'No form data received.';
    exit;
}

$patientName = isset($fields['name']) ? trim((string) $fields['name']) : '';

$pdf = new SimplePdf();
$pdf->addTitle('Soul Acupuncture Clinic - Patient Health History');
$pdf->addField('Form Submitted', date('F j, Y g:i A'));
$pdf->addSpacer();

foreach ($fields as $key => $value) {
    $pdf->addField(humanize_field_name((string) $key), format_field_value($value));
}

$pdfContent = $pdf->output();

$safeName = $patientName !== '' ? preg_replace('/[^A-Za-z0-9_-]+/', '_', $patientName) : 'patient';
$filename = 'Health-History-' . $safeName . '-' . date('Ymd-His') . '.pdf';

$emailSent = false;
$emailError = '';

try {
    $mailer = new SmtpMailer(SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS);
    $mailer->send(
        MAIL_FROM,
        MAIL_FROM_NAME,
        MAIL_TO,
        'New Health History Form Submission' . ($patientName !== '' ? ' - ' . $patientName : ''),
        "A new patient health history form was submitted through the website.\n\nSee the attached PDF for full details.",
        [
            'filename' => $filename,
            'content' => $pdfContent,
            'mime' => 'application/pdf',
        ]
    );
    $emailSent = true;
} catch (\Throwable $e) {
    $emailError = $e->getMessage();
}

if (!$emailSent) {
    $backupDir = __DIR__ . '/private/submissions';
    if (!is_dir($backupDir)) {
        mkdir($backupDir, 0755, true);
    }
    file_put_contents($backupDir . '/' . $filename, $pdfContent);
    error_log('Health history form email failed: ' . $emailError);
}
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Soul Acupuncture Clinic - Form Submitted</title>
    <link rel="stylesheet" href="health-history-form.css">
</head>

<body>
    <div class="container">
        <?php if ($emailSent): ?>
            <h1>Thank You</h1>
            <p>Your health history form has been submitted successfully. We look forward to seeing you at your
                appointment.</p>
        <?php else: ?>
            <h1>Submission Received</h1>
            <p>We received your form, but there was a problem emailing it automatically. Please call our office to
                confirm it arrived.</p>
        <?php endif; ?>
        <p><a href="../index.html">Return to homepage</a></p>
    </div>
</body>

</html>
