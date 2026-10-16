package util

import (
	"strings"

	"clash-config-store/internal/config"
)

// SubscriptionPublicURL 生成订阅拉取地址。
// 未显式配置 BASE_URL 时返回相对路径，避免把内部默认地址暴露给前端。
func SubscriptionPublicURL(token string) string {
	if config.App == nil || !config.App.BaseURLExplicit {
		return "/sub/" + token
	}

	base := strings.TrimRight(config.App.BaseURL, "/")
	return base + "/sub/" + token
}
