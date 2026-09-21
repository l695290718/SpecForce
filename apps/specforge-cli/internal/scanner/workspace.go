package scanner

import (
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"os"
	pathpkg "path"
	"path/filepath"
	"sort"
	"strings"
)

type FileMeta struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"sizeBytes"`
	Digest    string `json:"digest"`
}

type CoverageGap struct {
	Path   string `json:"path"`
	Reason string `json:"reason"`
}

type InventoryResult struct {
	Files []FileMeta    `json:"files"`
	Gaps  []CoverageGap `json:"gaps"`
}

func Inventory(root string, maxSourceFileBytes int64) (InventoryResult, error) {
	return InventoryWithPolicy(root, maxSourceFileBytes, nil)
}

func InventoryWithPolicy(root string, maxSourceFileBytes int64, ignorePatterns []string) (InventoryResult, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return InventoryResult{}, err
	}
	result := InventoryResult{Files: []FileMeta{}, Gaps: []CoverageGap{}}
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		relative, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return relErr
		}
		relative = filepath.ToSlash(relative)
		if walkErr != nil {
			result.Gaps = append(result.Gaps, CoverageGap{Path: relative, Reason: "SOURCE_PATH_UNREADABLE"})
			return nil
		}
		if entry.IsDir() {
			if relative == ".git" || relative == ".specforge" || ignored(relative, ignorePatterns) {
				return filepath.SkipDir
			}
			return nil
		}
		if relative == ".specforge.yaml" || ignored(relative, ignorePatterns) {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			target, targetErr := filepath.EvalSymlinks(path)
			if targetErr != nil || !withinRoot(root, target) {
				result.Gaps = append(result.Gaps, CoverageGap{Path: relative, Reason: "SYMLINK_ESCAPES_ROOT"})
			} else {
				result.Gaps = append(result.Gaps, CoverageGap{Path: relative, Reason: "SYMLINK_SKIPPED"})
			}
			return nil
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			result.Gaps = append(result.Gaps, CoverageGap{Path: relative, Reason: "SOURCE_PATH_UNREADABLE"})
			return nil
		}
		if info.Size() > maxSourceFileBytes {
			result.Gaps = append(result.Gaps, CoverageGap{Path: relative, Reason: "SOURCE_FILE_TOO_LARGE"})
			return nil
		}
		contents, readErr := os.ReadFile(path)
		if readErr != nil {
			result.Gaps = append(result.Gaps, CoverageGap{Path: relative, Reason: "SOURCE_PATH_UNREADABLE"})
			return nil
		}
		sum := sha256.Sum256(contents)
		result.Files = append(result.Files, FileMeta{Path: relative, SizeBytes: info.Size(), Digest: hex.EncodeToString(sum[:])})
		return nil
	})
	sort.Slice(result.Files, func(i, j int) bool { return result.Files[i].Path < result.Files[j].Path })
	sort.Slice(result.Gaps, func(i, j int) bool {
		if result.Gaps[i].Path == result.Gaps[j].Path {
			return result.Gaps[i].Reason < result.Gaps[j].Reason
		}
		return result.Gaps[i].Path < result.Gaps[j].Path
	})
	return result, err
}

func ignored(relative string, patterns []string) bool {
	relative = filepath.ToSlash(relative)
	for _, raw := range patterns {
		pattern := strings.TrimPrefix(filepath.ToSlash(strings.TrimSpace(raw)), "./")
		if pattern == "" {
			continue
		}
		if strings.HasSuffix(pattern, "/**") {
			prefix := strings.TrimSuffix(pattern, "/**")
			if relative == prefix || strings.HasPrefix(relative, prefix+"/") {
				return true
			}
			if !strings.Contains(prefix, "/") && strings.Contains("/"+relative+"/", "/"+prefix+"/") {
				return true
			}
			continue
		}
		if matched, err := pathpkg.Match(pattern, relative); err == nil && matched {
			return true
		}
	}
	return false
}

func withinRoot(root, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}
