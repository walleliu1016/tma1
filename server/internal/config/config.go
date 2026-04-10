package config

import (
	"encoding/toml"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// Config holds all runtime configuration for tma1-server.
type Config struct {
	// Host is the address tma1-server binds to (default 127.0.0.1).
	Host string

	// Port tma1-server listens on.
	Port string

	// DataDir is where GreptimeDB binary and data are stored (~/.tma1).
	DataDir string

	// GreptimeDBMode determines how to connect to GreptimeDB:
	// "local" - start and manage local GreptimeDB process
	// "remote" - connect to external GreptimeDB instance
	GreptimeDBMode string

	// GreptimeDBHost is the hostname/IP of GreptimeDB (used in remote mode,
	// or for internal connections in local mode).
	GreptimeDBHost string

	// GreptimeDB version to download ("latest" or "v0.x.y") - only used in local mode.
	GreptimeDBVersion string

	// GreptimeDB HTTP API port (used for SQL queries, health checks, and OTLP ingestion).
	GreptimeDBHTTPPort int

	// GreptimeDB gRPC port.
	GreptimeDBGRPCPort int

	// GreptimeDB MySQL port (used for direct SQL connections).
	GreptimeDBMySQLPort int

	// LogLevel: debug, info, warn, error.
	LogLevel string

	// DataTTL is the default TTL for auto-created tables (e.g. "60d", "30d").
	DataTTL string

	// LLMAPIKey is the API key for the LLM provider (optional, enables prompt evaluation).
	LLMAPIKey string

	// LLMProvider is the LLM provider: "anthropic" or "openai" (default "anthropic").
	LLMProvider string

	// LLMModel overrides the default model for the LLM provider.
	LLMModel string
}

// Load reads config from environment variables, with sensible defaults.
// This is the legacy function for backward compatibility.
func Load() (*Config, error) {
	return LoadWithFile("")
}

// LoadWithFile reads config from TOML file (if provided), then applies env var overrides.
// Priority: env vars > TOML file > defaults.
func LoadWithFile(configPath string) (*Config, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("config: cannot determine home dir: %w", err)
	}

	// 1. Start with defaults
	cfg := &Config{
		Host:               "127.0.0.1",
		Port:               "14318",
		DataDir:            filepath.Join(home, ".tma1"),
		GreptimeDBMode:     "local",
		GreptimeDBHost:     "localhost",
		GreptimeDBVersion:  "latest",
		GreptimeDBHTTPPort: 14000,
		GreptimeDBGRPCPort: 14001,
		GreptimeDBMySQLPort: 14002,
		LogLevel:           "info",
		DataTTL:            "60d",
		LLMAPIKey:          "",
		LLMProvider:        "anthropic",
		LLMModel:           "",
	}

	// 2. Load TOML file if provided
	if configPath != "" {
		fileCfg, err := parseTOMLFile(configPath)
		if err != nil {
			return nil, fmt.Errorf("config: parse TOML file: %w", err)
		}
		// Merge file config into defaults (file overrides defaults)
		mergeConfig(cfg, fileCfg)
	}

	// 3. Apply env var overrides (env vars have highest priority)
	applyEnvOverrides(cfg)

	return cfg, nil
}

// tomlConfig mirrors the TOML file structure.
type tomlConfig struct {
	Server     serverConfig     `toml:"server"`
	GreptimeDB greptimeDBConfig `toml:"greptimedb"`
	LLM        llmConfig        `toml:"llm"`
}

type serverConfig struct {
	Host     string `toml:"host"`
	Port     string `toml:"port"`
	LogLevel string `toml:"log_level"`
	DataTTL  string `toml:"data_ttl"`
	DataDir  string `toml:"data_dir"`
}

type greptimeDBConfig struct {
	Mode     string `toml:"mode"`
	Host     string `toml:"host"`
	HTTPPort int    `toml:"http_port"`
	GRPCPort int    `toml:"grpc_port"`
	MySQLPort int   `toml:"mysql_port"`
	Version  string `toml:"version"`
}

type llmConfig struct {
	APIKey   string `toml:"api_key"`
	Provider string `toml:"provider"`
	Model    string `toml:"model"`
}

// parseTOMLFile reads and parses a TOML configuration file.
func parseTOMLFile(path string) (*tomlConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg tomlConfig
	if err := toml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// mergeConfig applies TOML file values to the base config.
// Only non-empty/non-zero values from the file are applied.
func mergeConfig(base *Config, file *tomlConfig) {
	// Server section
	if file.Server.Host != "" {
		base.Host = file.Server.Host
	}
	if file.Server.Port != "" {
		base.Port = file.Server.Port
	}
	if file.Server.LogLevel != "" {
		base.LogLevel = file.Server.LogLevel
	}
	if file.Server.DataTTL != "" {
		base.DataTTL = file.Server.DataTTL
	}
	if file.Server.DataDir != "" {
		base.DataDir = file.Server.DataDir
	}

	// GreptimeDB section
	if file.GreptimeDB.Mode != "" {
		base.GreptimeDBMode = file.GreptimeDB.Mode
	}
	if file.GreptimeDB.Host != "" {
		base.GreptimeDBHost = file.GreptimeDB.Host
	}
	if file.GreptimeDB.HTTPPort != 0 {
		base.GreptimeDBHTTPPort = file.GreptimeDB.HTTPPort
	}
	if file.GreptimeDB.GRPCPort != 0 {
		base.GreptimeDBGRPCPort = file.GreptimeDB.GRPCPort
	}
	if file.GreptimeDB.MySQLPort != 0 {
		base.GreptimeDBMySQLPort = file.GreptimeDB.MySQLPort
	}
	if file.GreptimeDB.Version != "" {
		base.GreptimeDBVersion = file.GreptimeDB.Version
	}

	// LLM section
	if file.LLM.APIKey != "" {
		base.LLMAPIKey = file.LLM.APIKey
	}
	if file.LLM.Provider != "" {
		base.LLMProvider = file.LLM.Provider
	}
	if file.LLM.Model != "" {
		base.LLMModel = file.LLM.Model
	}
}

// applyEnvOverrides applies environment variable values to the config.
// Env vars always have the highest priority.
func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv("TMA1_HOST"); v != "" {
		cfg.Host = v
	}
	if v := os.Getenv("TMA1_PORT"); v != "" {
		cfg.Port = v
	}
	if v := os.Getenv("TMA1_DATA_DIR"); v != "" {
		cfg.DataDir = v
	}
	if v := os.Getenv("TMA1_GREPTIMEDB_MODE"); v != "" {
		cfg.GreptimeDBMode = v
	}
	if v := os.Getenv("TMA1_GREPTIMEDB_HOST"); v != "" {
		cfg.GreptimeDBHost = v
	}
	if v := os.Getenv("TMA1_GREPTIMEDB_VERSION"); v != "" {
		cfg.GreptimeDBVersion = v
	}
	if v := os.Getenv("TMA1_GREPTIMEDB_HTTP_PORT"); v != "" {
		cfg.GreptimeDBHTTPPort = parseInt(v, cfg.GreptimeDBHTTPPort)
	}
	if v := os.Getenv("TMA1_GREPTIMEDB_GRPC_PORT"); v != "" {
		cfg.GreptimeDBGRPCPort = parseInt(v, cfg.GreptimeDBGRPCPort)
	}
	if v := os.Getenv("TMA1_GREPTIMEDB_MYSQL_PORT"); v != "" {
		cfg.GreptimeDBMySQLPort = parseInt(v, cfg.GreptimeDBMySQLPort)
	}
	if v := os.Getenv("TMA1_LOG_LEVEL"); v != "" {
		cfg.LogLevel = v
	}
	if v := os.Getenv("TMA1_DATA_TTL"); v != "" {
		cfg.DataTTL = v
	}
	if v := os.Getenv("TMA1_LLM_API_KEY"); v != "" {
		cfg.LLMAPIKey = v
	}
	if v := os.Getenv("TMA1_LLM_PROVIDER"); v != "" {
		cfg.LLMProvider = v
	}
	if v := os.Getenv("TMA1_LLM_MODEL"); v != "" {
		cfg.LLMModel = v
	}
}

func parseInt(s string, fallback int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	return n
}
