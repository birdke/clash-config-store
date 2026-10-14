package service

import (
	"testing"

	"clash-config-store/internal/model"
	"clash-config-store/internal/repository"
	"clash-config-store/internal/repository/migrations"
	"clash-config-store/internal/testdb"

	"gopkg.in/yaml.v3"
)

func TestGenerateYAML_LoyalsoldierFormats(t *testing.T) {
	for _, upgrade := range []bool{false, true} {
		name := "fresh"
		if upgrade {
			name = "upgraded"
		}
		t.Run(name, func(t *testing.T) {
			testdb.UseMemorySQLite(t)
			db := repository.DB
			if err := repository.SeedRuleProviders(db); err != nil {
				t.Fatal(err)
			}
			var presets []model.RuleProvider
			if err := db.Where("is_preset = ?", true).Order("id").Find(&presets).Error; err != nil {
				t.Fatal(err)
			}
			if len(presets) != 13 {
				t.Fatalf("expected 13 presets, got %d", len(presets))
			}
			if upgrade {
				// Recreate the old database state, then migrate with an existing subscription.
				if err := db.Where("version = ?", 2).Delete(&migrations.SchemaMigration{}).Error; err != nil {
					t.Fatal(err)
				}
				if err := db.Model(&model.RuleProvider{}).Where("is_preset = ?", true).Update("format", "text").Error; err != nil {
					t.Fatal(err)
				}
			}
			user := model.User{Email: "generate@test.local", Name: "test", PasswordHash: "unused"}
			if err := db.Create(&user).Error; err != nil {
				t.Fatal(err)
			}
			// A legitimate user-owned text provider must remain text throughout the pipeline.
			text := model.RuleProvider{UserID: &user.ID, Name: "user-text", Type: "http",
				URL: "https://example.com/domains.txt", Behavior: "domain", Format: "text", Interval: 3600}
			if err := db.Create(&text).Error; err != nil {
				t.Fatal(err)
			}
			custom := model.CustomConfig{UserID: user.ID, Name: "test"}
			for _, rp := range append(presets, text) {
				custom.RuleProviderIDs = append(custom.RuleProviderIDs, rp.ID)
				custom.Rules = append(custom.Rules, "RULE-SET,"+rp.Name+",DIRECT")
			}
			custom.Rules = append(custom.Rules, "MATCH,DIRECT")
			if err := db.Create(&custom).Error; err != nil {
				t.Fatal(err)
			}
			sub := model.Subscription{UserID: user.ID, Name: "test", Token: "test-subscription",
				EnabledProviderIDs: "[]", CustomConfigID: &custom.ID, RuleInsertMode: model.RuleInsertReplace}
			if err := db.Create(&sub).Error; err != nil {
				t.Fatal(err)
			}
			if err := migrations.Up(db); err != nil {
				t.Fatal(err)
			}
			out, id, allowed, reason, err := GenerateYAML(sub.Token, "127.0.0.1")
			if err != nil || !allowed || id != sub.ID {
				t.Fatalf("GenerateYAML: id=%d allowed=%v reason=%s err=%v", id, allowed, reason, err)
			}
			var cfg struct {
				Providers map[string]struct {
					Format   string `yaml:"format"`
					Behavior string `yaml:"behavior"`
					URL      string `yaml:"url"`
				} `yaml:"rule-providers"`
				Rules []string `yaml:"rules"`
			}
			if err := yaml.Unmarshal(out, &cfg); err != nil {
				t.Fatal(err)
			}
			if len(cfg.Providers) != 14 || len(cfg.Rules) != len(custom.Rules) {
				t.Fatalf("missing providers or rules in generated subscription: %s", out)
			}
			for _, rp := range presets {
				got, ok := cfg.Providers[rp.Name]
				if !ok || (got.Format != "" && got.Format != "yaml") || got.URL != rp.URL || got.Behavior != rp.Behavior {
					t.Errorf("invalid generated preset %s: %+v", rp.Name, got)
				}
			}
			if cfg.Providers[text.Name].Format != "text" {
				t.Fatal("user text provider must retain its format")
			}
			for i, rule := range cfg.Rules {
				if rule != custom.Rules[i] {
					t.Fatalf("rule order changed at index %d", i)
				}
			}
		})
	}
}
