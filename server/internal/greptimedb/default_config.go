package greptimedb

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
)

const defaultConfigFileName = "standalone.toml"

//go:embed standalone-default.toml
var defaultConfig []byte

func ensureDefaultConfigFile(dataDir string) (string, error) {
	configDir := filepath.Join(dataDir, "config")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		return "", fmt.Errorf("greptimedb: create config dir: %w", err)
	}

	configPath := filepath.Join(configDir, defaultConfigFileName)
	if _, err := os.Stat(configPath); err == nil {
		return configPath, nil
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("greptimedb: stat config file: %w", err)
	}

	if err := os.WriteFile(configPath, defaultConfig, 0o644); err != nil {
		return "", fmt.Errorf("greptimedb: write default config: %w", err)
	}

	return configPath, nil
}

func startArgs(cfg Config, dataPath, configPath string) []string {
	return []string{
		"standalone", "start",
		"-c", configPath,
		"--data-home", dataPath,
		fmt.Sprintf("--http-addr=127.0.0.1:%d", cfg.HTTPPort),
		fmt.Sprintf("--rpc-bind-addr=127.0.0.1:%d", cfg.GRPCPort),
		fmt.Sprintf("--mysql-addr=127.0.0.1:%d", cfg.MySQLPort),
		// OTLP endpoint is part of the HTTP server in GreptimeDB standalone.
		// The HTTP port serves both the API and OTLP (/v1/otlp).
	}
}
