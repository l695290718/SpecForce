package extractors

import (
	"context"
	"path/filepath"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
	"gopkg.in/yaml.v3"
)

type ContractExtractor struct{}

func (ContractExtractor) ID() string      { return "openapi-asyncapi-contracts" }
func (ContractExtractor) Version() string { return "1.0.0" }
func (ContractExtractor) Supports(meta FileMeta) bool {
	path := strings.ToLower(filepath.ToSlash(meta.Path))
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	return (ext == ".yaml" || ext == ".yml" || ext == ".json") &&
		(strings.Contains(base, "openapi") || strings.Contains(base, "swagger") || strings.Contains(base, "asyncapi") ||
			strings.Contains(path, "/openapi/") || strings.Contains(path, "/asyncapi/"))
}

func (extractor ContractExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	var document yaml.Node
	if err := yaml.Unmarshal(file.Contents, &document); err != nil {
		return nil, parserGap(file.Meta.Path, "MALFORMED_API_CONTRACT"), nil
	}
	root := yamlDocumentRoot(&document)
	if root == nil || root.Kind != yaml.MappingNode {
		return nil, parserGap(file.Meta.Path, "MALFORMED_API_CONTRACT"), nil
	}
	if valueForKey(root, "openapi") != nil || valueForKey(root, "swagger") != nil {
		observations := extractor.extractOpenAPI(file, root)
		if len(observations) == 0 {
			return nil, parserGap(file.Meta.Path, "OPENAPI_HAS_NO_OPERATIONS"), nil
		}
		return observations, successfulDelta(file.Meta.Path, len(observations)), nil
	}
	if valueForKey(root, "asyncapi") != nil {
		observations := extractor.extractAsyncAPI(file, root)
		if len(observations) == 0 {
			return nil, parserGap(file.Meta.Path, "ASYNCAPI_HAS_NO_CHANNEL_OPERATIONS"), nil
		}
		return observations, successfulDelta(file.Meta.Path, len(observations)), nil
	}
	return nil, parserGap(file.Meta.Path, "API_CONTRACT_KIND_UNRECOGNIZED"), nil
}

func (extractor ContractExtractor) extractOpenAPI(file File, root *yaml.Node) []scancontract.SourceObservationV2 {
	paths := valueForKey(root, "paths")
	if paths == nil || paths.Kind != yaml.MappingNode {
		return nil
	}
	methods := map[string]bool{"get": true, "put": true, "post": true, "delete": true, "options": true, "head": true, "patch": true, "trace": true}
	var observations []scancontract.SourceObservationV2
	for i := 0; i+1 < len(paths.Content); i += 2 {
		pathNode, pathItem := paths.Content[i], paths.Content[i+1]
		if pathItem.Kind != yaml.MappingNode {
			continue
		}
		for j := 0; j+1 < len(pathItem.Content); j += 2 {
			methodNode, operation := pathItem.Content[j], pathItem.Content[j+1]
			method := strings.ToLower(methodNode.Value)
			if !methods[method] || operation.Kind != yaml.MappingNode {
				continue
			}
			operationID := scalarValue(valueForKey(operation, "operationId"))
			if operationID == "" {
				operationID = strings.ToUpper(method) + " " + pathNode.Value
			}
			lineStart, lineEnd := nodeRange(operation)
			observations = append(observations, makeObservation(file, observationSpec{
				ObservationType: "API_OPERATION", Layer: scancontract.ArchitectureLayerSys, Aspect: "api-contract",
				Symbol: operationID, LineStart: lineStart, LineEnd: lineEnd,
				ParserID: "yaml.v3-openapi", ParserVersion: extractor.Version(),
				Payload: map[string]any{"method": strings.ToUpper(method), "path": pathNode.Value, "operationId": operationID},
			}))
		}
	}
	return observations
}

func (extractor ContractExtractor) extractAsyncAPI(file File, root *yaml.Node) []scancontract.SourceObservationV2 {
	channels := valueForKey(root, "channels")
	if channels == nil || channels.Kind != yaml.MappingNode {
		return nil
	}
	var observations []scancontract.SourceObservationV2
	for i := 0; i+1 < len(channels.Content); i += 2 {
		channelNode, channel := channels.Content[i], channels.Content[i+1]
		if channel.Kind != yaml.MappingNode {
			continue
		}
		for _, direction := range []string{"publish", "subscribe"} {
			operation := valueForKey(channel, direction)
			if operation == nil || operation.Kind != yaml.MappingNode {
				continue
			}
			operationID := scalarValue(valueForKey(operation, "operationId"))
			if operationID == "" {
				operationID = direction + ":" + channelNode.Value
			}
			lineStart, lineEnd := nodeRange(operation)
			observations = append(observations, makeObservation(file, observationSpec{
				ObservationType: "EVENT_CHANNEL_OPERATION", Layer: scancontract.ArchitectureLayerSys, Aspect: "event-contract",
				Symbol: operationID, LineStart: lineStart, LineEnd: lineEnd,
				ParserID: "yaml.v3-asyncapi", ParserVersion: extractor.Version(),
				Payload: map[string]any{"channel": channelNode.Value, "direction": direction, "operationId": operationID},
			}))
		}
	}
	return observations
}

func yamlDocumentRoot(document *yaml.Node) *yaml.Node {
	if document == nil {
		return nil
	}
	if document.Kind == yaml.DocumentNode && len(document.Content) > 0 {
		return document.Content[0]
	}
	return document
}

func valueForKey(mapping *yaml.Node, key string) *yaml.Node {
	if mapping == nil || mapping.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			return mapping.Content[i+1]
		}
	}
	return nil
}

func scalarValue(node *yaml.Node) string {
	if node == nil || node.Kind != yaml.ScalarNode {
		return ""
	}
	return node.Value
}

func nodeRange(node *yaml.Node) (int, int) {
	if node == nil {
		return 1, 1
	}
	start, end := node.Line, node.Line
	var visit func(*yaml.Node)
	visit = func(current *yaml.Node) {
		if current.Line > 0 && (start == 0 || current.Line < start) {
			start = current.Line
		}
		if current.Line > end {
			end = current.Line
		}
		for _, child := range current.Content {
			visit(child)
		}
	}
	visit(node)
	if start < 1 {
		start = 1
	}
	if end < start {
		end = start
	}
	return start, end
}
