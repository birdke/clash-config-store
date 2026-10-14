package util

import (
	"testing"

	"gopkg.in/yaml.v3"
)

func TestBuildMihomoConfig_RuleProviderFormats(t *testing.T) {
	for _, format := range []string{"yaml", "text", "mrs"} {
		t.Run(format, func(t *testing.T) {
			providers := []RuleProviderInput{{
				Name: "test", Type: "http", Behavior: "domain", Format: format,
				URL: "https://example.com/rules.txt", Interval: 86400,
			}}
			out, err := BuildMihomoConfig("", nil, nil, nil, []string{"RULE-SET,test,DIRECT"}, "replace", providers, nil)
			if err != nil {
				t.Fatal(err)
			}
			var cfg struct {
				Providers map[string]struct {
					Format string `yaml:"format"`
					URL    string `yaml:"url"`
				} `yaml:"rule-providers"`
			}
			if err := yaml.Unmarshal(out, &cfg); err != nil {
				t.Fatal(err)
			}
			rp, ok := cfg.Providers["test"]
			if !ok {
				t.Fatal("missing rule-provider")
			}
			got := rp.Format
			if got == "" {
				got = "yaml" // Mihomo defaults to YAML when format is omitted.
			}
			if got != format {
				t.Fatalf("expected %s, got %s", format, got)
			}
			if rp.URL != providers[0].URL {
				t.Fatalf("URL extension must not determine the format: %s", rp.URL)
			}
		})
	}
}
