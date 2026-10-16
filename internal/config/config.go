package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

const defaultBaseURL = "http://localhost:26406"

type envLookup func(string) (string, bool)

type Config struct {
	Port string

	DBType string // "sqlite" 或 "mysql"
	DBDsn  string // SQLite 文件路径 或 MySQL DSN

	JWTSecret string
	JWTExpiry int // token 有效期（小时）

	GeoIPPath string // MaxMind GeoLite2 .mmdb 文件路径

	// BaseURL 保留内部默认值，除订阅链接外也用于托管规则集 URL。
	BaseURL string
	// BaseURLExplicit 表示部署者是否提供了非空的 BASE_URL。
	// 未显式配置时订阅链接使用相对路径，但托管规则集仍使用 BaseURL。
	BaseURLExplicit bool
}

var App *Config

func Load() *Config {
	// 尝试加载 .env 文件，不存在则忽略
	if err := godotenv.Load(); err != nil {
		slog.Info("未找到 .env 文件，使用环境变量", slog.String("component", "config"))
	}

	App = loadConfig(os.LookupEnv)
	return App
}

func loadConfig(lookup envLookup) *Config {
	baseURL, baseURLExplicit := getBaseURL(lookup)
	return &Config{
		Port:            getEnv(lookup, "APP_PORT", "26406"),
		DBType:          getEnv(lookup, "DB_TYPE", "sqlite"),
		DBDsn:           getEnv(lookup, "DB_DSN", "data.db"),
		JWTSecret:       getEnv(lookup, "JWT_SECRET", "please-change-this-secret-in-production"),
		JWTExpiry:       getEnvInt(lookup, "JWT_EXPIRY_HOURS", 24),
		GeoIPPath:       resolveGeoIPPath(lookup),
		BaseURL:         baseURL,
		BaseURLExplicit: baseURLExplicit,
	}
}

func resolveGeoIPPath(lookup envLookup) string {
	if v, ok := lookup("GEOIP_PATH"); ok && v != "" {
		return v
	}
	defaultPath := "/data/geoip/GeoLite2-City.mmdb"
	if _, err := os.Stat(defaultPath); err == nil {
		return defaultPath
	}
	// 本地开发通常不存在该文件，回退为空表示禁用 GeoIP。
	return ""
}

func getBaseURL(lookup envLookup) (string, bool) {
	value, ok := lookup("BASE_URL")
	value = strings.TrimSpace(value)
	if !ok || value == "" {
		return defaultBaseURL, false
	}
	return value, true
}

func getEnv(lookup envLookup, key, fallback string) string {
	if v, ok := lookup(key); ok && v != "" {
		return v
	}
	return fallback
}

func getEnvInt(lookup envLookup, key string, fallback int) int {
	if v, ok := lookup(key); ok && v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
