package extractors

import (
	"context"
	"testing"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

func TestGraphQLAndProtobufContractsProduceStableObservations(t *testing.T) {
	cases := []struct {
		path string
		body string
		want []string
	}{
		{"schema.graphql", "type Order { id: ID! }\nquery getOrder { order { id } }", []string{"DATA_ENTITY", "API_OPERATION"}},
		{"orders.proto", "message Order {}\nservice Orders { rpc GetOrder (Order) returns (Order); }", []string{"DATA_ENTITY", "RPC_SERVICE", "RPC_METHOD"}},
	}
	for _, test := range cases {
		contents := []byte(test.body)
		observations, coverage, err := (ContractExtractor{}).Extract(context.Background(), File{Meta: FileMeta{Path: test.path, SizeBytes: int64(len(contents)), Digest: scancontract.Sha256(sha256Hex(contents))}, Contents: contents, Repository: testRepository(), MaxExcerpt: 1024})
		if err != nil {
			t.Fatal(err)
		}
		if len(observations) == 0 || coverage.ObservationCount != len(observations) {
			t.Fatalf("path=%s observations=%v coverage=%+v", test.path, observations, coverage)
		}
		for _, expected := range test.want {
			found := false
			for _, observation := range observations {
				if observation.ObservationType == expected {
					found = true
					break
				}
			}
			if !found {
				t.Fatalf("path=%s missing=%s observations=%v", test.path, expected, observations)
			}
		}
	}
}
