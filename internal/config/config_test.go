package config

import "testing"

func TestLoadConfigBaseURLState(t *testing.T) {
	tests := []struct {
		name         string
		env          map[string]string
		wantBaseURL  string
		wantExplicit bool
	}{
		{
			name:         "unset uses internal default without explicit state",
			wantBaseURL:  defaultBaseURL,
			wantExplicit: false,
		},
		{
			name:         "empty is not explicit",
			env:          map[string]string{"BASE_URL": ""},
			wantBaseURL:  defaultBaseURL,
			wantExplicit: false,
		},
		{
			name:         "whitespace is not explicit",
			env:          map[string]string{"BASE_URL": "  \t  "},
			wantBaseURL:  defaultBaseURL,
			wantExplicit: false,
		},
		{
			name:         "explicit value is trimmed and preserved",
			env:          map[string]string{"BASE_URL": " https://public.example:8443/panel/ "},
			wantBaseURL:  "https://public.example:8443/panel/",
			wantExplicit: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lookup := func(key string) (string, bool) {
				value, ok := tt.env[key]
				return value, ok
			}

			cfg := loadConfig(lookup)
			if cfg.BaseURL != tt.wantBaseURL {
				t.Fatalf("BaseURL = %q, want %q", cfg.BaseURL, tt.wantBaseURL)
			}
			if cfg.BaseURLExplicit != tt.wantExplicit {
				t.Fatalf("BaseURLExplicit = %t, want %t", cfg.BaseURLExplicit, tt.wantExplicit)
			}
		})
	}
}
