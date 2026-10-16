package util

import (
	"testing"

	"clash-config-store/internal/config"
)

func TestSubscriptionPublicURL(t *testing.T) {
	previous := config.App
	t.Cleanup(func() { config.App = previous })

	tests := []struct {
		name     string
		baseURL  string
		explicit bool
		want     string
	}{
		{
			name:     "internal default is not exposed",
			baseURL:  "http://localhost:26406",
			explicit: false,
			want:     "/sub/synthetic-token",
		},
		{
			name:     "blank configuration state remains relative",
			baseURL:  "http://localhost:26406",
			explicit: false,
			want:     "/sub/synthetic-token",
		},
		{
			name:     "explicit public URL keeps path and port",
			baseURL:  "https://public.example:8443/panel/",
			explicit: true,
			want:     "https://public.example:8443/panel/sub/synthetic-token",
		},
		{
			name:     "explicit localhost is honored",
			baseURL:  "http://localhost:26406",
			explicit: true,
			want:     "http://localhost:26406/sub/synthetic-token",
		},
		{
			name:     "trailing slashes are normalized",
			baseURL:  "https://public.example/panel///",
			explicit: true,
			want:     "https://public.example/panel/sub/synthetic-token",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config.App = &config.Config{
				BaseURL:         tt.baseURL,
				BaseURLExplicit: tt.explicit,
			}

			if got := SubscriptionPublicURL("synthetic-token"); got != tt.want {
				t.Fatalf("SubscriptionPublicURL() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSubscriptionPublicURLWithoutLoadedConfig(t *testing.T) {
	previous := config.App
	t.Cleanup(func() { config.App = previous })
	config.App = nil

	if got := SubscriptionPublicURL("synthetic-token"); got != "/sub/synthetic-token" {
		t.Fatalf("SubscriptionPublicURL() = %q, want relative fallback", got)
	}
}

func TestRuleSetPublicURLKeepsInternalBaseURL(t *testing.T) {
	previous := config.App
	t.Cleanup(func() { config.App = previous })
	config.App = &config.Config{
		BaseURL:         "http://localhost:26406",
		BaseURLExplicit: false,
	}

	if got := RuleSetPublicURL("synthetic-token", "rules.yaml"); got != "http://localhost:26406/ruleset/synthetic-token/rules.yaml" {
		t.Fatalf("RuleSetPublicURL() = %q, want internal base URL", got)
	}
}
