<?php
declare(strict_types=1);

/**
 * Minimal SMTP client (AUTH LOGIN + STARTTLS/implicit TLS) with a single
 * attachment. No external dependencies, since this environment has no
 * composer/vendor setup.
 */
class SmtpMailer
{
    private string $host;
    private int $port;
    private string $secure; // 'tls', 'ssl', or ''
    private string $username;
    private string $password;

    /** @var resource|null */
    private $socket = null;

    public function __construct(string $host, int $port, string $secure, string $username, string $password)
    {
        $this->host = $host;
        $this->port = $port;
        $this->secure = $secure;
        $this->username = $username;
        $this->password = $password;
    }

    /**
     * @param array{filename: string, content: string, mime: string} $attachment
     */
    public function send(
        string $fromEmail,
        string $fromName,
        string $toEmail,
        string $subject,
        string $body,
        array $attachment
    ): void {
        $this->connect();
        try {
            $this->hello();

            if ($this->secure === 'tls') {
                $this->command('STARTTLS', 220);
                if (!stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new RuntimeException('Failed to enable TLS for SMTP connection');
                }
                $this->hello();
            }

            $this->command('AUTH LOGIN', 334);
            $this->command(base64_encode($this->username), 334);
            $this->command(base64_encode($this->password), 235);

            $this->command('MAIL FROM:<' . $fromEmail . '>', 250);
            $this->command('RCPT TO:<' . $toEmail . '>', 250);
            $this->command('DATA', 354);

            $message = $this->buildMessage($fromEmail, $fromName, $toEmail, $subject, $body, $attachment);
            $this->write($this->dotStuff($message) . "\r\n.\r\n");
            $this->readResponse(250);

            $this->command('QUIT', 221);
        } finally {
            $this->disconnect();
        }
    }

    private function connect(): void
    {
        $transport = $this->secure === 'ssl' ? 'ssl://' : 'tcp://';
        $this->socket = @stream_socket_client(
            $transport . $this->host . ':' . $this->port,
            $errno,
            $errstr,
            15,
            STREAM_CLIENT_CONNECT
        );
        if (!$this->socket) {
            throw new RuntimeException("Could not connect to SMTP host: $errstr ($errno)");
        }
        $this->readResponse(220);
    }

    private function hello(): void
    {
        $this->command('EHLO ' . (gethostname() ?: 'localhost'), 250);
    }

    private function command(string $cmd, int $expectedCode): string
    {
        $this->write($cmd . "\r\n");
        return $this->readResponse($expectedCode);
    }

    private function write(string $data): void
    {
        if (fwrite($this->socket, $data) === false) {
            throw new RuntimeException('Failed writing to SMTP socket');
        }
    }

    private function readResponse(int $expectedCode): string
    {
        $response = '';
        while (($line = fgets($this->socket, 515)) !== false) {
            $response .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        $code = (int) substr($response, 0, 3);
        if ($code !== $expectedCode) {
            throw new RuntimeException("SMTP error, expected $expectedCode, got: " . trim($response));
        }
        return $response;
    }

    private function disconnect(): void
    {
        if ($this->socket) {
            fclose($this->socket);
            $this->socket = null;
        }
    }

    private function dotStuff(string $message): string
    {
        return preg_replace('/^\./m', '..', $message);
    }

    /**
     * @param array{filename: string, content: string, mime: string} $attachment
     */
    private function buildMessage(
        string $fromEmail,
        string $fromName,
        string $toEmail,
        string $subject,
        string $body,
        array $attachment
    ): string {
        $boundary = 'bnd_' . bin2hex(random_bytes(12));

        $headers = [
            'Date: ' . date('r'),
            'From: ' . $this->encodeHeader($fromName) . ' <' . $fromEmail . '>',
            'To: <' . $toEmail . '>',
            'Subject: ' . $this->encodeHeader($subject),
            'MIME-Version: 1.0',
            'Content-Type: multipart/mixed; boundary="' . $boundary . '"',
        ];

        $bodyPart = "--$boundary\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . $body . "\r\n";

        $attachmentPart = "--$boundary\r\n"
            . 'Content-Type: ' . $attachment['mime'] . '; name="' . $attachment['filename'] . "\"\r\n"
            . "Content-Transfer-Encoding: base64\r\n"
            . 'Content-Disposition: attachment; filename="' . $attachment['filename'] . "\"\r\n\r\n"
            . chunk_split(base64_encode($attachment['content'])) . "\r\n";

        $closing = "--$boundary--\r\n";

        return implode("\r\n", $headers) . "\r\n\r\n" . $bodyPart . $attachmentPart . $closing;
    }

    private function encodeHeader(string $text): string
    {
        if (preg_match('/[^\x20-\x7E]/', $text)) {
            return '=?UTF-8?B?' . base64_encode($text) . '?=';
        }
        return $text;
    }
}
