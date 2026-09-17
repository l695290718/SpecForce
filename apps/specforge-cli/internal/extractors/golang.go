package extractors

import (
	"bytes"
	"context"
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/l695290718/specforge/apps/specforge-cli/internal/scancontract"
)

type GoExtractor struct{}

var (
	goRoutePattern      = regexp.MustCompile(`(?m)\b(?:router|r|e|engine|app)\.(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\(\s*["']([^"']+)["']`)
	goSQLPattern        = regexp.MustCompile(`(?m)\b(?:db|tx|q|queries|conn|database)\.(Query|QueryRow|Exec|Get|Select|Raw)\s*\(`)
	goDependencyPattern = regexp.MustCompile(`(?m)\b(?:http\.NewRequest|http\.Client\s*\{|client\.Do)\s*\(`)
)

func (GoExtractor) ID() string      { return "go-ast" }
func (GoExtractor) Version() string { return "1.0.0" }
func (GoExtractor) Supports(meta FileMeta) bool {
	return strings.EqualFold(filepath.Ext(meta.Path), ".go") && !isTestPath(meta.Path)
}

func (extractor GoExtractor) Extract(ctx context.Context, file File) ([]scancontract.SourceObservationV2, scancontract.ScanCoverageDelta, error) {
	if err := checkContext(ctx); err != nil {
		return nil, scancontract.ScanCoverageDelta{}, err
	}
	fset := token.NewFileSet()
	parsed, err := parser.ParseFile(fset, file.Meta.Path, file.Contents, parser.SkipObjectResolution)
	if err != nil {
		return nil, parserGap(file.Meta.Path, "GO_AST_PARSE_FAILED"), nil
	}
	var observations []scancontract.SourceObservationV2
	for _, match := range goRoutePattern.FindAllSubmatchIndex(file.Contents, -1) {
		method, path := submatch(file.Contents, match, 2), submatch(file.Contents, match, 4)
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "API_OPERATION", Layer: scancontract.ArchitectureLayerSys, Aspect: "application-service",
			Symbol: strings.ToUpper(method) + " " + path, LineStart: start, LineEnd: end,
			ParserID: "go/parser", ParserVersion: extractor.Version(),
			Payload: map[string]any{"framework": "go-router", "method": strings.ToUpper(method), "path": path},
		}))
	}
	for _, declaration := range parsed.Decls {
		switch node := declaration.(type) {
		case *ast.GenDecl:
			if node.Tok != token.TYPE {
				continue
			}
			for _, specNode := range node.Specs {
				typeSpec, ok := specNode.(*ast.TypeSpec)
				if !ok {
					continue
				}
				kind := "type"
				fieldCount := 0
				observationType := "CODE_TYPE"
				aspect := "implementation-structure"
				if structure, ok := typeSpec.Type.(*ast.StructType); ok {
					kind = "struct"
					fieldCount = structure.Fields.NumFields()
					if hasDataModelTags(structure) {
						observationType = "DATA_ENTITY"
						aspect = "data-model"
					}
				}
				start, end := goNodeRange(fset, node)
				observations = append(observations, makeObservation(file, observationSpec{
					ObservationType: observationType, Layer: scancontract.ArchitectureLayerTech, Aspect: aspect,
					Symbol: typeSpec.Name.Name, LineStart: start, LineEnd: end,
					ParserID: "go/parser", ParserVersion: extractor.Version(),
					Payload: map[string]any{"package": parsed.Name.Name, "name": typeSpec.Name.Name, "kind": kind, "fieldCount": fieldCount},
				}))
			}
		case *ast.FuncDecl:
			if !looksLikeGoHandler(node, file.Contents, fset) {
				continue
			}
			start, end := goNodeRange(fset, node)
			observations = append(observations, makeObservation(file, observationSpec{
				ObservationType: "HTTP_HANDLER", Layer: scancontract.ArchitectureLayerSys, Aspect: "application-service",
				Symbol: goFunctionName(node), LineStart: start, LineEnd: end,
				ParserID: "go/parser", ParserVersion: extractor.Version(),
				Payload: map[string]any{"package": parsed.Name.Name, "function": goFunctionName(node)},
			}))
		}
	}
	ast.Inspect(parsed, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || !isPublisherMethod(selector.Sel.Name) {
			return true
		}
		start, end := goNodeRange(fset, call)
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "EVENT_PUBLICATION", Layer: scancontract.ArchitectureLayerSys, Aspect: "event-flow",
			Symbol: selector.Sel.Name, LineStart: start, LineEnd: end,
			ParserID: "go/parser", ParserVersion: extractor.Version(),
			Payload: map[string]any{"method": selector.Sel.Name},
		}))
		return true
	})
	for _, match := range goSQLPattern.FindAllSubmatchIndex(file.Contents, -1) {
		method := submatch(file.Contents, match, 2)
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "SQL_QUERY", Layer: scancontract.ArchitectureLayerTech, Aspect: "data-access",
			Symbol: method, LineStart: start, LineEnd: end,
			ParserID: "go/parser", ParserVersion: extractor.Version(),
			Payload: map[string]any{"method": method},
		}))
	}
	for _, match := range goDependencyPattern.FindAllIndex(file.Contents, -1) {
		start, end := lineForOffset(file.Contents, match[0]), lineForOffset(file.Contents, match[1])
		observations = append(observations, makeObservation(file, observationSpec{
			ObservationType: "SERVICE_DEPENDENCY", Layer: scancontract.ArchitectureLayerTech, Aspect: "outbound-integration",
			Symbol: "http-client", LineStart: start, LineEnd: end,
			ParserID: "go/parser", ParserVersion: extractor.Version(),
			Payload: map[string]any{"client": "net/http"},
		}))
	}
	if len(observations) == 0 {
		return nil, successfulDelta(file.Meta.Path, 0, "GO_AST_NO_SUPPORTED_CONSTRUCTS"), nil
	}
	sortObservations(observations)
	return observations, successfulDelta(file.Meta.Path, len(observations)), nil
}

func looksLikeGoHandler(function *ast.FuncDecl, contents []byte, fset *token.FileSet) bool {
	if strings.HasSuffix(function.Name.Name, "Handler") || strings.HasPrefix(function.Name.Name, "Handle") {
		return true
	}
	if function.Type.Params == nil {
		return false
	}
	start := fset.Position(function.Type.Params.Pos()).Offset
	end := fset.Position(function.Type.Params.End()).Offset
	if start < 0 || end < start || end > len(contents) {
		return false
	}
	params := contents[start:end]
	return bytes.Contains(params, []byte("http.ResponseWriter")) || bytes.Contains(params, []byte("gin.Context")) || bytes.Contains(params, []byte("fiber.Ctx"))
}

func goFunctionName(function *ast.FuncDecl) string {
	if function.Recv == nil || len(function.Recv.List) == 0 {
		return function.Name.Name
	}
	return "method." + function.Name.Name
}

func hasDataModelTags(structure *ast.StructType) bool {
	for _, field := range structure.Fields.List {
		if field.Tag != nil && (strings.Contains(field.Tag.Value, "json:") || strings.Contains(field.Tag.Value, "gorm:") || strings.Contains(field.Tag.Value, "db:")) {
			return true
		}
	}
	return false
}

func goNodeRange(fset *token.FileSet, node ast.Node) (int, int) {
	return fset.Position(node.Pos()).Line, fset.Position(node.End()).Line
}

func isPublisherMethod(name string) bool {
	switch strings.ToLower(name) {
	case "publish", "publishcontext", "emit", "send", "produce":
		return true
	default:
		return false
	}
}
