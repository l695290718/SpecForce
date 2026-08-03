package scanner

import (
	"bytes"
	"regexp"
	"unicode/utf8"
)

var secretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?s)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?(-----END [A-Z0-9 ]*PRIVATE KEY-----|$)`),
	regexp.MustCompile(`(?i)(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*[^\s]+`),
	regexp.MustCompile(`(?i)authorization\s*:\s*(bearer|basic)\s+[^\s]+`),
}

func RedactExcerpt(contents []byte, maxBytes int) (string, bool) {
	if maxBytes <= 0 {
		return "", len(contents) > 0
	}
	redacted := append([]byte(nil), contents...)
	changed := false
	for _, pattern := range secretPatterns {
		next := pattern.ReplaceAll(redacted, []byte("[REDACTED]"))
		if !bytes.Equal(next, redacted) {
			changed = true
		}
		redacted = next
	}
	if len(redacted) > maxBytes {
		redacted = redacted[:maxBytes]
		changed = true
		for len(redacted) > 0 && !utf8.Valid(redacted) {
			redacted = redacted[:len(redacted)-1]
		}
	}
	return string(redacted), changed
}
