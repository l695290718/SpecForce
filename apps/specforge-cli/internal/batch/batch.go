package batch

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

func Build(
	session scancontract.ScanSessionDescriptor,
	sequence int,
	previous *scancontract.Sha256,
	observations []scancontract.SourceObservationV2,
	coverage scancontract.ScanCoverageDelta,
) (scancontract.KnowledgeScanBatch, error) {
	if sequence < 0 || coverage.ObservationCount != len(observations) {
		return scancontract.KnowledgeScanBatch{}, errors.New("SCAN_BATCH_INPUT_INVALID")
	}
	batch := scancontract.KnowledgeScanBatch{
		ContractVersion:     session.ContractVersion,
		SessionId:           session.SessionId,
		Sequence:            sequence,
		PreviousBatchDigest: previous,
		SessionNonceDigest:  scancontract.Sha256(digestString(session.SessionNonce)),
		ArchitectureScope:   session.ArchitectureScope,
		Observations:        observations,
		CoverageDelta:       coverage,
	}
	payloadDigest, err := canonicalDigest(map[string]any{"observations": batch.Observations, "coverageDelta": batch.CoverageDelta})
	if err != nil {
		return scancontract.KnowledgeScanBatch{}, err
	}
	digest, err := canonicalDigest(map[string]any{
		"contractVersion": batch.ContractVersion, "sessionId": batch.SessionId, "sequence": batch.Sequence,
		"previousBatchDigest": batch.PreviousBatchDigest, "sessionNonceDigest": batch.SessionNonceDigest,
		"architectureScope": batch.ArchitectureScope, "payloadDigest": payloadDigest,
	})
	if err != nil {
		return scancontract.KnowledgeScanBatch{}, err
	}
	batch.BatchDigest = scancontract.Sha256(digest)
	return batch, nil
}

func Marshal(value scancontract.KnowledgeScanBatch) ([]byte, error) {
	return json.Marshal(value)
}

func canonicalDigest(value any) (string, error) {
	canonical, err := canonicalJSON(value)
	if err != nil {
		return "", err
	}
	return digestString(string(canonical)), nil
}

func canonicalJSON(value any) ([]byte, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var normalized any
	if err := json.Unmarshal(encoded, &normalized); err != nil {
		return nil, err
	}
	return canonicalValue(normalized)
}

func canonicalValue(value any) ([]byte, error) {
	switch typed := value.(type) {
	case nil, bool, string, float64:
		return json.Marshal(typed)
	case []any:
		parts := make([]string, len(typed))
		for index, item := range typed {
			canonical, err := canonicalValue(item)
			if err != nil {
				return nil, err
			}
			parts[index] = string(canonical)
		}
		return []byte("[" + strings.Join(parts, ",") + "]"), nil
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			encodedKey, _ := json.Marshal(key)
			encodedValue, err := canonicalValue(typed[key])
			if err != nil {
				return nil, err
			}
			parts = append(parts, string(encodedKey)+":"+string(encodedValue))
		}
		return []byte("{" + strings.Join(parts, ",") + "}"), nil
	default:
		return nil, errors.New("CANONICAL_JSON_VALUE_INVALID")
	}
}

func digestString(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
