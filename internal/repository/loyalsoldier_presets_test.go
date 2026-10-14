package repository

import (
	"reflect"
	"testing"

	"clash-config-store/internal/model"
	"clash-config-store/internal/repository/migrations"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func newPresetTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	return db
}

func TestSeedLoyalsoldierPresetsYAML(t *testing.T) {
	db := newPresetTestDB(t)
	if err := migrations.Up(db); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := SeedRuleProviders(db); err != nil {
			t.Fatal(err)
		}
	}
	var presets []model.RuleProvider
	if err := db.Order("id").Find(&presets).Error; err != nil {
		t.Fatal(err)
	}
	expected := map[string]string{
		"reject": "domain", "icloud": "domain", "apple": "domain", "google": "domain",
		"proxy": "domain", "direct": "domain", "private": "domain", "gfw": "domain",
		"tld-not-cn": "domain", "telegramcidr": "ipcidr", "cncidr": "ipcidr",
		"lancidr": "ipcidr", "applications": "classical",
	}
	if len(presets) != len(expected) {
		t.Fatalf("expected %d presets after repeated seeding, got %d", len(expected), len(presets))
	}
	for _, rp := range presets {
		if rp.Format != "yaml" || rp.Behavior != expected[rp.Name] || !rp.IsPreset || rp.UserID != nil || rp.PresetTag != "loyalsoldier" {
			t.Errorf("%s: format=%q behavior=%q preset=%v tag=%q", rp.Name, rp.Format, rp.Behavior, rp.IsPreset, rp.PresetTag)
		}
		if rp.URL != "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/"+rp.Name+".txt" {
			t.Errorf("unexpected URL: %s", rp.URL)
		}
	}
}

func TestMigrateLoyalsoldierFormats(t *testing.T) {
	db := newPresetTestDB(t)
	// Simulate a database created by the old release, with only schema version 1 applied.
	if err := migrations.ApplySchema(db); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Ensure(db); err != nil {
		t.Fatal(err)
	}
	if err := migrations.MarkApplied(db, 1); err != nil {
		t.Fatal(err)
	}

	var originals []model.RuleProvider
	var ids []uint
	for _, rp := range loyalsoldierPresets() {
		rp.Format = "text" // Historical bug, independent of the new seed default.
		if err := db.Create(rp).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.First(rp, rp.ID).Error; err != nil {
			t.Fatal(err)
		}
		originals = append(originals, *rp)
		ids = append(ids, rp.ID)
	}
	user := model.User{Email: "preset-migration@test.local", Name: "test", PasswordHash: "unused"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	custom := model.CustomConfig{UserID: user.ID, Name: "existing references", RuleProviderIDs: ids}
	if err := db.Create(&custom).Error; err != nil {
		t.Fatal(err)
	}

	// Similar records must not be mistaken for the original erroneous system presets.
	guards := []struct {
		name   string
		mutate func(*model.RuleProvider)
	}{
		{"user-owned", func(rp *model.RuleProvider) { rp.UserID = &user.ID }},
		{"non-preset", func(rp *model.RuleProvider) { rp.IsPreset = false }},
		{"other-tag", func(rp *model.RuleProvider) { rp.PresetTag = "custom" }},
		{"other-name", func(rp *model.RuleProvider) { rp.Name = "custom-list" }},
		{"other-url", func(rp *model.RuleProvider) { rp.URL = "https://example.com/reject.txt" }},
		{"other-behavior", func(rp *model.RuleProvider) { rp.Behavior = "classical" }},
		{"file-provider", func(rp *model.RuleProvider) { rp.Type = "file" }},
		{"already-yaml", func(rp *model.RuleProvider) { rp.Format = "yaml" }},
		{"mrs-provider", func(rp *model.RuleProvider) { rp.Format = "mrs" }},
	}
	var untouched []model.RuleProvider
	for _, guard := range guards {
		rp := loyalsoldierPresets()[0]
		rp.Format = "text"
		guard.mutate(rp)
		if err := db.Create(rp).Error; err != nil {
			t.Fatalf("%s: %v", guard.name, err)
		}
		if err := db.First(rp, rp.ID).Error; err != nil {
			t.Fatal(err)
		}
		untouched = append(untouched, *rp)
	}

	for i := 0; i < 2; i++ {
		if err := migrations.Up(db); err != nil {
			t.Fatal(err)
		}
		if err := SeedRuleProviders(db); err != nil {
			t.Fatal(err)
		}
	}
	for _, before := range originals {
		var after model.RuleProvider
		if err := db.First(&after, before.ID).Error; err != nil {
			t.Fatal(err)
		}
		if after.Format != "yaml" {
			t.Errorf("%s: expected yaml after migration, got %s", after.Name, after.Format)
		}
		before.Format = after.Format
		before.UpdatedAt = after.UpdatedAt
		if !reflect.DeepEqual(before, after) {
			t.Errorf("migration changed unrelated fields for %s", before.Name)
		}
	}
	for i, before := range untouched {
		var after model.RuleProvider
		if err := db.First(&after, before.ID).Error; err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(before, after) {
			t.Errorf("migration changed protected record %s", guards[i].name)
		}
	}
	var afterCustom model.CustomConfig
	if err := db.First(&afterCustom, custom.ID).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(ids, afterCustom.RuleProviderIDs) {
		t.Fatal("migration changed existing custom-config references")
	}
	var count int64
	if err := db.Model(&model.RuleProvider{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != int64(len(originals)+len(untouched)) {
		t.Fatalf("migration/seeding created or deleted providers: count=%d", count)
	}
}
