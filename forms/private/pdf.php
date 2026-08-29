<?php
declare(strict_types=1);

/**
 * Minimal single-page-flow PDF writer. No external dependencies - builds
 * a valid PDF (Helvetica text only) directly, since this environment has
 * no composer/vendor setup to pull in a real PDF library.
 */
class SimplePdf
{
    private int $pageWidth = 612;
    private int $pageHeight = 792;
    private int $marginX = 54;
    private int $marginTop = 54;
    private int $marginBottom = 54;

    /** @var string[] finished page content streams */
    private array $pages = [];
    private string $buffer = '';
    private float $y;

    public function __construct()
    {
        $this->y = $this->pageHeight - $this->marginTop;
    }

    public function addTitle(string $text): void
    {
        $this->writeLine($text, true, 18);
        $this->y -= 6;
    }

    public function addSpacer(int $height = 10): void
    {
        $this->y -= $height;
        if ($this->y < $this->marginBottom) {
            $this->newPage();
        }
    }

    public function addField(string $label, string $value): void
    {
        $size = 11;
        $maxChars = max(20, (int) floor(($this->pageWidth - 2 * $this->marginX) / ($size * 0.52)));
        $text = $label . ': ' . ($value === '' ? '-' : $value);
        $wrapped = wordwrap($text, $maxChars, "\n", true);
        foreach (explode("\n", $wrapped) as $line) {
            $this->writeLine($line, false, $size);
        }
    }

    private function writeLine(string $text, bool $bold, int $size): void
    {
        if ($this->y < $this->marginBottom) {
            $this->newPage();
        }
        $font = $bold ? 'F2' : 'F1';
        $escaped = $this->escape($text);
        $this->buffer .= sprintf(
            "BT /%s %d Tf 1 0 0 1 %d %d Tm (%s) Tj ET\n",
            $font,
            $size,
            $this->marginX,
            (int) round($this->y),
            $escaped
        );
        $this->y -= round($size * 1.4);
    }

    private function newPage(): void
    {
        $this->pages[] = $this->buffer;
        $this->buffer = '';
        $this->y = $this->pageHeight - $this->marginTop;
    }

    private function escape(string $text): string
    {
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
    }

    public function output(): string
    {
        $this->pages[] = $this->buffer;
        $n = count($this->pages);

        $fontF1 = 3;
        $fontF2 = 4;
        $firstPageObj = 5;

        $kids = [];
        for ($i = 0; $i < $n; $i++) {
            $kids[] = ($firstPageObj + $i * 2) . ' 0 R';
        }

        $objects = [];
        $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . $n . ' >>';
        $objects[$fontF1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        $objects[$fontF2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

        for ($i = 0; $i < $n; $i++) {
            $pageObjNum = $firstPageObj + $i * 2;
            $contentObjNum = $pageObjNum + 1;
            $objects[$pageObjNum] = sprintf(
                '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>',
                $this->pageWidth,
                $this->pageHeight,
                $fontF1,
                $fontF2,
                $contentObjNum
            );
            $content = $this->pages[$i];
            $objects[$contentObjNum] = "<< /Length " . strlen($content) . " >>\nstream\n" . $content . "endstream";
        }

        ksort($objects);

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $num => $body) {
            $offsets[$num] = strlen($pdf);
            $pdf .= $num . " 0 obj\n" . $body . "\nendobj\n";
        }

        $xrefStart = strlen($pdf);
        $maxObj = max(array_keys($objects));
        $pdf .= "xref\n0 " . ($maxObj + 1) . "\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i <= $maxObj; $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }
        $pdf .= "trailer\n<< /Size " . ($maxObj + 1) . " /Root 1 0 R >>\nstartxref\n" . $xrefStart . "\n%%EOF";

        return $pdf;
    }
}
