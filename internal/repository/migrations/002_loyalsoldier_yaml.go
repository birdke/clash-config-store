package migrations

import (
	"fmt"

	"clash-config-store/internal/model"

	"gorm.io/gorm"
)

func init() {
	register(Migration{
		Version: 2,
		Up:      fixLoyalsoldierPresetFormats,
	})
}

// fixLoyalsoldierPresetFormats repairs the original seeded records in place.
// The upstream .txt files contain YAML payloads. Keep this historical list and
// URL fixed so later changes to seed defaults cannot broaden this migration.
func fixLoyalsoldierPresetFormats(db *gorm.DB) error {
	const baseURL = "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/"
	presets := []struct{ name, behavior string }{
		{"reject", "domain"},
		{"icloud", "domain"},
		{"apple", "domain"},
		{"google", "domain"},
		{"proxy", "domain"},
		{"direct", "domain"},
		{"private", "domain"},
		{"gfw", "domain"},
		{"tld-not-cn", "domain"},
		{"telegramcidr", "ipcidr"},
		{"cncidr", "ipcidr"},
		{"lancidr", "ipcidr"},
		{"applications", "classical"},
	}
	for _, p := range presets {
		// Only known erroneous system presets: leave user-owned/customized entries
		// and already-correct formats alone. IDs and all references stay unchanged.
		err := db.Model(&model.RuleProvider{}).
			Where("is_preset = ? AND user_id IS NULL AND preset_tag = ?", true, "loyalsoldier").
			Where("name = ? AND url = ?", p.name, baseURL+p.name+".txt").
			Where("type = ? AND behavior = ? AND format = ?", "http", p.behavior, "text").
			Update("format", "yaml").Error
		if err != nil {
			return fmt.Errorf("修正规则集预设 %s 格式失败: %w", p.name, err)
		}
	}
	return nil
}
