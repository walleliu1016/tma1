package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	// Clear all TMA1_ env vars to test defaults.
	for _, key := range []string{
		"TMA1_HOST", "TMA1_PORT", "TMA1_DATA_DIR", "TMA1_GREPTIMEDB_VERSION",
		"TMA1_GREPTIMEDB_HTTP_PORT", "TMA1_GREPTIMEDB_GRPC_PORT", "TMA1_GREPTIMEDB_MYSQL_PORT", "TMA1_LOG_LEVEL",
		"TMA1_GREPTIMEDB_MODE", "TMA1_GREPTIMEDB_HOST",
	} {
		t.Setenv(key, "")
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	home, _ := os.UserHomeDir()
	tests := []struct {
		name string
		got  string
		want string
	}{
		{"Host", cfg.Host, "127.0.0.1"},
		{"Port", cfg.Port, "14318"},
		{"DataDir", cfg.DataDir, filepath.Join(home, ".tma1")},
		{"GreptimeDBVersion", cfg.GreptimeDBVersion, "latest"},
		{"LogLevel", cfg.LogLevel, "info"},
		{"GreptimeDBMode", cfg.GreptimeDBMode, "local"},
		{"GreptimeDBHost", cfg.GreptimeDBHost, "localhost"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Errorf("got %q, want %q", tt.got, tt.want)
			}
		})
	}

	intTests := []struct {
		name string
		got  int
		want int
	}{
		{"GreptimeDBHTTPPort", cfg.GreptimeDBHTTPPort, 14000},
		{"GreptimeDBGRPCPort", cfg.GreptimeDBGRPCPort, 14001},
		{"GreptimeDBMySQLPort", cfg.GreptimeDBMySQLPort, 14002},
	}
	for _, tt := range intTests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Errorf("got %d, want %d", tt.got, tt.want)
			}
		})
	}
}

func TestLoadEnvOverrides(t *testing.T) {
	t.Setenv("TMA1_HOST", "0.0.0.0")
	t.Setenv("TMA1_PORT", "9999")
	t.Setenv("TMA1_DATA_DIR", "/tmp/tma1-test")
	t.Setenv("TMA1_GREPTIMEDB_VERSION", "v0.12.0")
	t.Setenv("TMA1_GREPTIMEDB_HTTP_PORT", "5000")
	t.Setenv("TMA1_GREPTIMEDB_GRPC_PORT", "5001")
	t.Setenv("TMA1_GREPTIMEDB_MYSQL_PORT", "5002")
	t.Setenv("TMA1_LOG_LEVEL", "debug")
	t.Setenv("TMA1_GREPTIMEDB_MODE", "remote")
	t.Setenv("TMA1_GREPTIMEDB_HOST", "192.168.1.100")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	tests := []struct {
		name string
		got  string
		want string
	}{
		{"Host", cfg.Host, "0.0.0.0"},
		{"Port", cfg.Port, "9999"},
		{"DataDir", cfg.DataDir, "/tmp/tma1-test"},
		{"GreptimeDBVersion", cfg.GreptimeDBVersion, "v0.12.0"},
		{"LogLevel", cfg.LogLevel, "debug"},
		{"GreptimeDBMode", cfg.GreptimeDBMode, "remote"},
		{"GreptimeDBHost", cfg.GreptimeDBHost, "192.168.1.100"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Errorf("got %q, want %q", tt.got, tt.want)
			}
		})
	}

	intTests := []struct {
		name string
		got  int
		want int
	}{
		{"GreptimeDBHTTPPort", cfg.GreptimeDBHTTPPort, 5000},
		{"GreptimeDBGRPCPort", cfg.GreptimeDBGRPCPort, 5001},
		{"GreptimeDBMySQLPort", cfg.GreptimeDBMySQLPort, 5002},
	}
	for _, tt := range intTests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Errorf("got %d, want %d", tt.got, tt.want)
			}
		})
	}
}

func TestEnvIntInvalidFallback(t *testing.T) {
	t.Setenv("TMA1_GREPTIMEDB_HTTP_PORT", "not-a-number")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.GreptimeDBHTTPPort != 14000 {
		t.Errorf("expected fallback 14000 for invalid int, got %d", cfg.GreptimeDBHTTPPort)
	}
}

func TestLoadWithFileTOML(t *testing.T) {
	// Clear env vars
	for _, key := range []string{
		"TMA1_HOST", "TMA1_PORT", "TMA1_DATA_DIR", "TMA1_GREPTIMEDB_VERSION",
		"TMA1_GREPTIMEDB_HTTP_PORT", "TMA1_GREPTIMEDB_GRPC_PORT", "TMA1_GREPTIMEDB_MYSQL_PORT", "TMA1_LOG_LEVEL",
		"TMA1_GREPTIMEDB_MODE", "TMA1_GREPTIMEDB_HOST", "TMA1_LLM_API_KEY", "TMA1_LLM_PROVIDER", "TMA1_LLM_MODEL",
	} {
		t.Setenv(key, "")
	}

	// Create temp TOML file
	tomlContent := `
[server]
host = "0.0.0.0"
port = "8080"
log_level = "debug"
data_ttl = "30d"

[greptimedb]
mode = "remote"
host = "db.example.com"
http_port = 4000
grpc_port = 4001
mysql_port = 4002
version = "v0.15.0"

[llm]
api_key = "test-key-123"
provider = "openai"
model = "gpt-4"
`
	tmpFile := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(tmpFile, []byte(tomlContent), 0o644); err != nil {
		t.Fatalf("failed to write temp TOML: %v", err)
	}

	cfg, err := LoadWithFile(tmpFile)
	if err != nil {
		t.Fatalf("LoadWithFile() returned error: %v", err)
	}

	tests := []struct {
		name string
		got  string
		want string
	}{
		{"Host", cfg.Host, "0.0.0.0"},
		{"Port", cfg.Port, "8080"},
		{"LogLevel", cfg.LogLevel, "debug"},
		{"DataTTL", cfg.DataTTL, "30d"},
		{"GreptimeDBMode", cfg.GreptimeDBMode, "remote"},
		{"GreptimeDBHost", cfg.GreptimeDBHost, "db.example.com"},
		{"GreptimeDBVersion", cfg.GreptimeDBVersion, "v0.15.0"},
		{"LLMAPIKey", cfg.LLMAPIKey, "test-key-123"},
		{"LLMProvider", cfg.LLMProvider, "openai"},
		{"LLMModel", cfg.LLMModel, "gpt-4"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Errorf("got %q, want %q", tt.got, tt.want)
			}
		})
	}

	intTests := []struct {
		name string
		got  int
		want int
	}{
		{"GreptimeDBHTTPPort", cfg.GreptimeDBHTTPPort, 4000},
		{"GreptimeDBGRPCPort", cfg.GreptimeDBGRPCPort, 4001},
		{"GreptimeDBMySQLPort", cfg.GreptimeDBMySQLPort, 4002},
	}
	for _, tt := range intTests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Errorf("got %d, want %d", tt.got, tt.want)
			}
		})
	}
}

func TestLoadWithFileEnvOverride(t *testing.T) {
	// Env vars should override TOML values
	t.Setenv("TMA1_HOST", "env-host")
	t.Setenv("TMA1_GREPTIMEDB_MODE", "local")
	t.Setenv("TMA1_GREPTIMEDB_HOST", "env-db-host")

	tomlContent := `
[server]
host = "toml-host"

[greptimedb]
mode = "remote"
host = "toml-db-host"
`
	tmpFile := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(tmpFile, []byte(tomlContent), 0o644); err != nil {
		t.Fatalf("failed to write temp TOML: %v", err)
	}

	cfg, err := LoadWithFile(tmpFile)
	if err != nil {
		t.Fatalf("LoadWithFile() returned error: %v", err)
	}

	// Env vars win
	if cfg.Host != "env-host" {
		t.Errorf("Host: got %q, want %q (env should override)", cfg.Host, "env-host")
	}
	if cfg.GreptimeDBMode != "local" {
		t.Errorf("GreptimeDBMode: got %q, want %q (env should override)", cfg.GreptimeDBMode, "local")
	}
	if cfg.GreptimeDBHost != "env-db-host" {
		t.Errorf("GreptimeDBHost: got %q, want %q (env should override)", cfg.GreptimeDBHost, "env-db-host")
	}
}

func TestLoadWithFileEmptyPath(t *testing.T) {
	// Empty path should use defaults
	for _, key := range []string{
		"TMA1_HOST", "TMA1_PORT", "TMA1_GREPTIMEDB_MODE", "TMA1_GREPTIMEDB_HOST",
	} {
		t.Setenv(key, "")
	}

	cfg, err := LoadWithFile("")
	if err != nil {
		t.Fatalf("LoadWithFile('') returned error: %v", err)
	}

	if cfg.GreptimeDBMode != "local" {
		t.Errorf("expected default mode 'local', got %q", cfg.GreptimeDBMode)
	}
	if cfg.GreptimeDBHost != "localhost" {
		t.Errorf("expected default host 'localhost', got %q", cfg.GreptimeDBHost)
	}
}
