package connector

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

const (
	ContractVersion         = "continuous-observation/v1"
	MaxObservationsPerBatch = 500
)

type Observation struct {
	ID                string         `json:"id"`
	ExternalAssetType string         `json:"externalAssetType"`
	ExternalID        string         `json:"externalId"`
	Payload           map[string]any `json:"payload"`
	SourceVersion     string         `json:"sourceVersion"`
	ObservedAt        string         `json:"observedAt,omitempty"`
}

type Batch struct {
	ContractVersion     string                         `json:"contractVersion"`
	ArchitectureScope   scancontract.ArchitectureScope `json:"architectureScope"`
	ConnectorID         string                         `json:"connectorId"`
	SourceNamespace     string                         `json:"sourceNamespace"`
	Sequence            int                            `json:"sequence"`
	PreviousBatchDigest *string                        `json:"previousBatchDigest"`
	SourceCursor        *string                        `json:"sourceCursor"`
	ObservedAt          string                         `json:"observedAt"`
	Observations        []Observation                  `json:"observations"`
	Coverage            map[string]any                 `json:"coverage"`
	PayloadDigest       string                         `json:"payloadDigest"`
	BatchDigest         string                         `json:"batchDigest"`
}

type Checkpoint struct {
	AcceptedSequence    int
	AcceptedBatchDigest *string
	SourceCursor        *string
}

type ObservationPage struct {
	SourceCursor  *string
	SourceVersion string
	ObservedAt    string
	Observations  []Observation
	Coverage      map[string]any
	HasMore       bool
}

func BuildBatch(scope scancontract.ArchitectureScope, connectorID, sourceNamespace string, checkpoint Checkpoint, page ObservationPage) (Batch, error) {
	if err := scope.Validate(); err != nil || connectorID == "" || sourceNamespace == "" || page.ObservedAt == "" || page.SourceVersion == "" {
		return Batch{}, errors.New("OBSERVATION_BATCH_INPUT_INVALID")
	}
	if len(page.Observations) > MaxObservationsPerBatch {
		return Batch{}, errors.New("OBSERVATION_BATCH_BUDGET_EXCEEDED")
	}
	sequence := checkpoint.AcceptedSequence + 1
	batch := Batch{
		ContractVersion: ContractVersion, ArchitectureScope: scope, ConnectorID: connectorID, SourceNamespace: sourceNamespace,
		Sequence: sequence, PreviousBatchDigest: checkpoint.AcceptedBatchDigest, SourceCursor: page.SourceCursor,
		ObservedAt: page.ObservedAt, Observations: page.Observations, Coverage: page.Coverage,
	}
	payloadDigest, err := canonicalDigest(map[string]any{"observations": batch.Observations, "coverage": batch.Coverage})
	if err != nil {
		return Batch{}, err
	}
	batch.PayloadDigest = payloadDigest
	batch.BatchDigest, err = canonicalDigest(map[string]any{
		"contractVersion": batch.ContractVersion, "architectureScope": batch.ArchitectureScope, "connectorId": batch.ConnectorID,
		"sourceNamespace": batch.SourceNamespace, "sequence": batch.Sequence, "previousBatchDigest": batch.PreviousBatchDigest,
		"sourceCursor": batch.SourceCursor, "observedAt": batch.ObservedAt, "payloadDigest": batch.PayloadDigest,
	})
	if err != nil {
		return Batch{}, err
	}
	return batch, nil
}

func (batch Batch) Validate(expectedScope scancontract.ArchitectureScope) error {
	if batch.ContractVersion != ContractVersion || batch.Sequence < 0 || batch.ConnectorID == "" || batch.SourceNamespace == "" || batch.ObservedAt == "" {
		return errors.New("OBSERVATION_BATCH_INPUT_INVALID")
	}
	if batch.ArchitectureScope != expectedScope {
		return errors.New("SCOPE_MISMATCH")
	}
	if len(batch.Observations) > MaxObservationsPerBatch {
		return errors.New("OBSERVATION_BATCH_BUDGET_EXCEEDED")
	}
	for _, observation := range batch.Observations {
		if observation.ID == "" || observation.ExternalAssetType == "" || observation.ExternalID == "" || observation.SourceVersion == "" || observation.Payload == nil {
			return errors.New("OBSERVATION_BATCH_INPUT_INVALID")
		}
	}
	encoded, err := json.Marshal(batch)
	if err != nil || len(encoded) > 4_194_304 {
		return errors.New("OBSERVATION_BATCH_BUDGET_EXCEEDED")
	}
	integrity, err := BuildBatch(expectedScope, batch.ConnectorID, batch.SourceNamespace, Checkpoint{AcceptedSequence: batch.Sequence - 1, AcceptedBatchDigest: batch.PreviousBatchDigest}, ObservationPage{SourceCursor: batch.SourceCursor, SourceVersion: batch.ObservationsSourceVersion(), ObservedAt: batch.ObservedAt, Observations: batch.Observations, Coverage: batch.Coverage})
	if err != nil || integrity.PayloadDigest != batch.PayloadDigest || integrity.BatchDigest != batch.BatchDigest {
		return errors.New("OBSERVATION_BATCH_DIGEST_MISMATCH")
	}
	return nil
}

func (batch Batch) ObservationsSourceVersion() string {
	if len(batch.Observations) == 0 {
		return "empty"
	}
	return batch.Observations[0].SourceVersion
}

func ParseCursor(value *string) (snapshotDigest string, offset int, ok bool) {
	if value == nil || *value == "" {
		return "", 0, false
	}
	parts := strings.Split(*value, ":")
	if len(parts) != 4 || parts[0] != "local-repository" || parts[1] != "v1" || len(parts[2]) != 64 {
		return "", 0, false
	}
	if _, err := hex.DecodeString(parts[2]); err != nil {
		return "", 0, false
	}
	var parsed int
	if _, err := fmt.Sscanf(parts[3], "%d", &parsed); err != nil || parsed < 0 {
		return "", 0, false
	}
	return parts[2], parsed, true
}

func Cursor(snapshotDigest string, offset int) *string {
	value := fmt.Sprintf("local-repository:v1:%s:%d", snapshotDigest, offset)
	return &value
}

func StableObservedAt(snapshotDigest string) string {
	if len(snapshotDigest) < 12 {
		return "2000-01-01T00:00:00.000Z"
	}
	var prefix uint64
	_, _ = fmt.Sscanf(snapshotDigest[:12], "%x", &prefix)
	return time.Unix(946684800+int64(prefix%3155695200), 0).UTC().Format(time.RFC3339Nano)
}

func canonicalDigest(value any) (string, error) {
	canonical, err := canonicalJSON(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
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
