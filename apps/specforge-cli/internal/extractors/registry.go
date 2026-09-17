package extractors

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
	"github.com/l695290718/specforge/apps/specforge-cli/internal/scanner"
)

const (
	DefaultMaxSourceFileBytes = 10 * 1024 * 1024
	DefaultMaxExcerptBytes    = 8 * 1024
)

type FileMeta struct {
	Path      string
	SizeBytes int64
	Digest    scancontract.Sha256
}

type File struct {
	Meta       FileMeta
	Contents   []byte
	Repository scancontract.RepositoryIdentity
	MaxExcerpt int
}

type Extractor interface {
	ID() string
	Version() string
	Supports(FileMeta) bool
	Extract(context.Context, File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error)
}

type Registry struct {
	extractors []Extractor
}

// DefaultRegistry is deliberately the only registry constructor exposed by this
// package. Repository content cannot add executable extractors at runtime.
func DefaultRegistry() Registry {
	return Registry{extractors: []Extractor{
		RepositoryExtractor{},
		ContractExtractor{},
		SchemaExtractor{},
		GoExtractor{},
		JavaExtractor{},
		PythonExtractor{},
		TypeScriptExtractor{},
		TestExtractor{},
		ConfigExtractor{},
		DeploymentExtractor{},
		ObservabilityExtractor{},
		DocumentationExtractor{},
	}}
}

func (r Registry) IDs() []string {
	ids := make([]string, len(r.extractors))
	for i, extractor := range r.extractors {
		ids[i] = extractor.ID()
	}
	return ids
}

// ExtractAll extracts a scanner inventory without re-walking the workspace. It
// verifies every listed file against its inventory digest before extraction.
func (r Registry) ExtractAll(ctx context.Context, root string, repository scancontract.RepositoryIdentity, files []scanner.FileMeta, maxExcerptBytes int) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	ordered := append([]scanner.FileMeta(nil), files...)
	sort.Slice(ordered, func(i, j int) bool { return filepath.ToSlash(ordered[i].Path) < filepath.ToSlash(ordered[j].Path) })
	if maxExcerptBytes < 0 {
		maxExcerptBytes = DefaultMaxExcerptBytes
	}
	var observations []scancontract.SourceObservationV2
	delta := scancontract.ScanCoverageDelta{}
	for _, inventoryFile := range ordered {
		if err := checkContext(ctx); err != nil {
			return nil, scancontract.ScanCoverageDelta{}, err
		}
		file, gap := loadInventoryFile(root, inventoryFile, repository, maxExcerptBytes)
		if gap != "" {
			delta.SkippedFiles++
			delta.CoverageGaps = append(delta.CoverageGaps, coverageGap(inventoryFile.Path, gap))
			continue
		}
		got, fileDelta, err := r.ExtractFile(ctx, file)
		if err != nil {
			return nil, scancontract.ScanCoverageDelta{}, err
		}
		observations = append(observations, got...)
		delta.IndexedFiles += fileDelta.IndexedFiles
		delta.SkippedFiles += fileDelta.SkippedFiles
		delta.ObservationCount += fileDelta.ObservationCount
		delta.CoverageGaps = append(delta.CoverageGaps, fileDelta.CoverageGaps...)
	}
	sortObservations(observations)
	delta.CoverageGaps = uniqueSorted(delta.CoverageGaps)
	return observations, delta, nil
}

func (r Registry) ExtractFile(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	var observations []scancontract.SourceObservationV2
	var gaps []string
	supported := false
	indexed := false
	for _, extractor := range r.extractors {
		if !extractor.Supports(file.Meta) {
			continue
		}
		supported = true
		got, delta, err := extractor.Extract(ctx, file)
		if err != nil {
			return nil, scancontract.ScanCoverageDelta{}, err
		}
		observations = append(observations, got...)
		gaps = append(gaps, delta.CoverageGaps...)
		indexed = indexed || delta.IndexedFiles > 0
	}
	if !supported {
		gaps = append(gaps, coverageGap(file.Meta.Path, "UNSUPPORTED_SOURCE_TYPE"))
	}
	sortObservations(observations)
	gaps = uniqueSorted(gaps)
	delta := scancontract.ScanCoverageDelta{ObservationCount: len(observations), CoverageGaps: gaps}
	if supported && indexed {
		delta.IndexedFiles = 1
	} else {
		delta.SkippedFiles = 1
	}
	return observations, delta, nil
}

func (r Registry) ScanWorkspace(ctx context.Context, root string, repository scancontract.RepositoryIdentity, maxSourceFileBytes int64) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if maxSourceFileBytes <= 0 {
		maxSourceFileBytes = DefaultMaxSourceFileBytes
	}
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	var observations []scancontract.SourceObservationV2
	delta := scancontract.ScanCoverageDelta{}
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			rel := relativePath(root, path)
			delta.SkippedFiles++
			delta.CoverageGaps = append(delta.CoverageGaps, coverageGap(rel, "SOURCE_PATH_UNREADABLE"))
			return nil
		}
		rel := relativePath(root, path)
		if entry.IsDir() {
			if rel == ".git" || rel == ".specforge" || strings.HasPrefix(rel, ".specforge/") {
				return filepath.SkipDir
			}
			return nil
		}
		file, gap := loadFile(root, path, rel, entry, repository, maxSourceFileBytes)
		if gap != "" {
			delta.SkippedFiles++
			delta.CoverageGaps = append(delta.CoverageGaps, coverageGap(rel, gap))
			return nil
		}
		got, fileDelta, extractErr := r.ExtractFile(ctx, file)
		if extractErr != nil {
			return extractErr
		}
		observations = append(observations, got...)
		delta.IndexedFiles += fileDelta.IndexedFiles
		delta.SkippedFiles += fileDelta.SkippedFiles
		delta.ObservationCount += fileDelta.ObservationCount
		delta.CoverageGaps = append(delta.CoverageGaps, fileDelta.CoverageGaps...)
		return nil
	})
	if err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	sortObservations(observations)
	delta.CoverageGaps = uniqueSorted(delta.CoverageGaps)
	return observations, delta, nil
}

func loadFile(root, path, rel string, entry fs.DirEntry, repository scancontract.RepositoryIdentity, maxBytes int64) (File, string) {
	if entry.Type()&os.ModeSymlink != 0 {
		target, err := filepath.EvalSymlinks(path)
		if err != nil || !withinRoot(root, target) {
			return File{}, "SYMLINK_ESCAPES_ROOT"
		}
		return File{}, "SYMLINK_SKIPPED"
	}
	if credentialPath(rel) {
		return File{}, "CREDENTIAL_FILE_BLOCKED"
	}
	info, err := entry.Info()
	if err != nil {
		return File{}, "SOURCE_PATH_UNREADABLE"
	}
	if info.Size() > maxBytes {
		return File{}, "SOURCE_FILE_TOO_LARGE"
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return File{}, "SOURCE_PATH_UNREADABLE"
	}
	if bytes.IndexByte(contents, 0) >= 0 {
		return File{}, "BINARY_SOURCE_SKIPPED"
	}
	digest := sha256Hex(contents)
	return File{
		Meta:       FileMeta{Path: filepath.ToSlash(rel), SizeBytes: info.Size(), Digest: scancontract.Sha256(digest)},
		Contents:   contents,
		Repository: repository,
		MaxExcerpt: DefaultMaxExcerptBytes,
	}, ""
}

func loadInventoryFile(root string, inventoryFile scanner.FileMeta, repository scancontract.RepositoryIdentity, maxExcerpt int) (File, string) {
	rel := filepath.Clean(filepath.FromSlash(inventoryFile.Path))
	if rel == "." || filepath.IsAbs(rel) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return File{}, "SOURCE_PATH_OUTSIDE_ROOT"
	}
	path := filepath.Join(root, rel)
	if !withinRoot(root, path) {
		return File{}, "SOURCE_PATH_OUTSIDE_ROOT"
	}
	if credentialPath(rel) {
		return File{}, "CREDENTIAL_FILE_BLOCKED"
	}
	info, err := os.Lstat(path)
	if err != nil {
		return File{}, "SOURCE_PATH_UNREADABLE"
	}
	if info.Mode()&os.ModeSymlink != 0 {
		target, targetErr := filepath.EvalSymlinks(path)
		if targetErr != nil || !withinRoot(root, target) {
			return File{}, "SYMLINK_ESCAPES_ROOT"
		}
		return File{}, "SYMLINK_SKIPPED"
	}
	if info.Size() != inventoryFile.SizeBytes {
		return File{}, "SOURCE_FILE_CHANGED"
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return File{}, "SOURCE_PATH_UNREADABLE"
	}
	if bytes.IndexByte(contents, 0) >= 0 {
		return File{}, "BINARY_SOURCE_SKIPPED"
	}
	digest := sha256Hex(contents)
	if !strings.EqualFold(digest, inventoryFile.Digest) {
		return File{}, "SOURCE_FILE_CHANGED"
	}
	return File{
		Meta:       FileMeta{Path: filepath.ToSlash(inventoryFile.Path), SizeBytes: info.Size(), Digest: scancontract.Sha256(digest)},
		Contents:   contents,
		Repository: repository,
		MaxExcerpt: maxExcerpt,
	}, ""
}

type observationSpec struct {
	ObservationType string
	Layer           scancontract.ArchitectureLayer
	Aspect          string
	Symbol          string
	LineStart       int
	LineEnd         int
	ParserID        string
	ParserVersion   string
	Payload         map[string]any
	Warnings        []string
	CoverageGaps    []string
}

func makeObservation(file File, spec observationSpec) scancontract.SourceObservationV2 {
	if spec.LineStart < 1 {
		spec.LineStart = 1
	}
	if spec.LineEnd < spec.LineStart {
		spec.LineEnd = spec.LineStart
	}
	excerptBytes := sourceLines(file.Contents, spec.LineStart, spec.LineEnd)
	maxExcerpt := file.MaxExcerpt
	if maxExcerpt < 0 {
		maxExcerpt = DefaultMaxExcerptBytes
	}
	excerpt, changed := scanner.RedactExcerpt(excerptBytes, maxExcerpt)
	redaction := scancontract.RedactionResult{Status: scancontract.RedactionStatusNone, Reasons: []string{}}
	sensitivity := scancontract.SensitivityClassificationInternal
	evidenceKind := scancontract.EvidenceKindSourceExcerpt
	evidenceDigest := scancontract.Sha256(sha256Hex([]byte(excerpt)))
	var evidenceExcerpt *string
	if maxExcerpt == 0 {
		redaction.Status = scancontract.RedactionStatusBlocked
		redaction.Reasons = []string{"EXCERPT_DISABLED_BY_POLICY"}
		evidenceKind = scancontract.EvidenceKindContentAddress
		evidenceDigest = file.Meta.Digest
	} else {
		evidenceExcerpt = &excerpt
	}
	if maxExcerpt > 0 && changed {
		redaction.Status = scancontract.RedactionStatusRedacted
		redaction.Reasons = []string{"SECRET_OR_SIZE_POLICY"}
		sensitivity = scancontract.SensitivityClassificationConfidential
	}
	symbol := nullableString(spec.Symbol)
	lineStart, lineEnd := spec.LineStart, spec.LineEnd
	aspect := nullableString(spec.Aspect)
	evidenceID := "evidence:" + string(evidenceDigest)
	observation := scancontract.SourceObservationV2{
		ObservationType:   spec.ObservationType,
		ArchitectureLayer: spec.Layer,
		AspectHint:        aspect,
		Repository:        file.Repository,
		Source:            scancontract.SourceLocation{Path: file.Meta.Path, Symbol: symbol, LineStart: &lineStart, LineEnd: &lineEnd},
		Parser:            scancontract.ParserDescriptor{Id: spec.ParserID, Version: spec.ParserVersion},
		Payload:           spec.Payload,
		Sensitivity:       sensitivity,
		Redaction:         redaction,
		EvidenceRefs:      []scancontract.ObservationEvidenceRef{{Id: evidenceID, Kind: evidenceKind, Digest: evidenceDigest, Excerpt: evidenceExcerpt}},
		Warnings:          uniqueSorted(spec.Warnings),
		CoverageGaps:      uniqueSorted(spec.CoverageGaps),
	}
	normalized := struct {
		ObservationType   string
		ArchitectureLayer scancontract.ArchitectureLayer
		AspectHint        *string
		Repository        scancontract.RepositoryIdentity
		Source            scancontract.SourceLocation
		Parser            scancontract.ParserDescriptor
		Payload           map[string]any
		Sensitivity       scancontract.SensitivityClassification
		Redaction         scancontract.RedactionResult
		EvidenceRefs      []scancontract.ObservationEvidenceRef
		Warnings          []string
		CoverageGaps      []string
	}{
		observation.ObservationType, observation.ArchitectureLayer, observation.AspectHint,
		observation.Repository, observation.Source, observation.Parser, observation.Payload,
		observation.Sensitivity, observation.Redaction, observation.EvidenceRefs,
		observation.Warnings, observation.CoverageGaps,
	}
	encoded, _ := json.Marshal(normalized)
	observation.NormalizedDigest = scancontract.Sha256(sha256Hex(encoded))
	observation.Id = "observation:" + string(observation.NormalizedDigest)
	return observation
}

func parserGap(path, reason string) scancontract.ScanCoverageDelta {
	return scancontract.ScanCoverageDelta{SkippedFiles: 1, CoverageGaps: []string{coverageGap(path, reason)}}
}

func successfulDelta(path string, observations int, gaps ...string) scancontract.ScanCoverageDelta {
	qualified := make([]string, 0, len(gaps))
	for _, gap := range gaps {
		qualified = append(qualified, coverageGap(path, gap))
	}
	return scancontract.ScanCoverageDelta{IndexedFiles: 1, ObservationCount: observations, CoverageGaps: uniqueSorted(qualified)}
}

func sourceLines(contents []byte, start, end int) []byte {
	lines := strings.Split(string(contents), "\n")
	if start > len(lines) {
		return nil
	}
	if end > len(lines) {
		end = len(lines)
	}
	return []byte(strings.Join(lines[start-1:end], "\n"))
}

func lineForOffset(contents []byte, offset int) int {
	if offset < 0 {
		return 1
	}
	if offset > len(contents) {
		offset = len(contents)
	}
	return 1 + bytes.Count(contents[:offset], []byte{'\n'})
}

func coverageGap(path, reason string) string { return filepath.ToSlash(path) + ":" + reason }

func sha256Hex(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func uniqueSorted(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := map[string]struct{}{}
	for _, value := range values {
		if value != "" {
			seen[value] = struct{}{}
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func sortObservations(observations []scancontract.SourceObservationV2) {
	sort.Slice(observations, func(i, j int) bool {
		left, right := observations[i], observations[j]
		if left.Source.Path != right.Source.Path {
			return left.Source.Path < right.Source.Path
		}
		leftLine, rightLine := 0, 0
		if left.Source.LineStart != nil {
			leftLine = *left.Source.LineStart
		}
		if right.Source.LineStart != nil {
			rightLine = *right.Source.LineStart
		}
		if leftLine != rightLine {
			return leftLine < rightLine
		}
		if left.ObservationType != right.ObservationType {
			return left.ObservationType < right.ObservationType
		}
		return left.Id < right.Id
	})
}

func relativePath(root, path string) string {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return filepath.ToSlash(path)
	}
	return filepath.ToSlash(rel)
}

func withinRoot(root, candidate string) bool {
	rel, err := filepath.Rel(root, candidate)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func credentialPath(path string) bool {
	base := strings.ToLower(filepath.Base(path))
	if base == ".env" || strings.HasPrefix(base, ".env.") || base == "id_rsa" || base == "id_ed25519" {
		return true
	}
	return strings.HasSuffix(base, ".pem") || strings.HasSuffix(base, ".key") || strings.HasSuffix(base, ".p12") || strings.HasSuffix(base, ".pfx")
}

func checkContext(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return nil
}

var errUnsupportedDocument = errors.New("UNSUPPORTED_DOCUMENT")
