// Package install handles downloading the GreptimeDB binary.
package install

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	githubReleaseBase = "https://github.com/GreptimeTeam/greptimedb/releases"
)

// EnsureGreptimeDB checks whether the GreptimeDB binary exists in dataDir/bin/.
// If not, it downloads and extracts the requested version.
// version may be "latest" or a specific tag like "v0.12.0".
func EnsureGreptimeDB(dataDir, version string, logger *slog.Logger) (binPath string, err error) {
	binDir := filepath.Join(dataDir, "bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		return "", fmt.Errorf("install: create bin dir: %w", err)
	}

	binPath = filepath.Join(binDir, "greptime")
	if _, err := os.Stat(binPath); err == nil {
		logger.Info("greptimedb binary already present", "path", binPath)
		return binPath, nil
	}

	resolvedVersion, err := resolveVersion(version)
	if err != nil {
		return "", fmt.Errorf("install: resolve version: %w", err)
	}
	logger.Info("downloading greptimedb", "version", resolvedVersion)

	downloadURL, err := buildDownloadURL(resolvedVersion)
	if err != nil {
		return "", err
	}

	tmpFile, err := os.CreateTemp("", "greptime-*.tar.gz")
	if err != nil {
		return "", fmt.Errorf("install: create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	if err := downloadFile(tmpFile, downloadURL); err != nil {
		return "", fmt.Errorf("install: download %s: %w", downloadURL, err)
	}

	if _, err := tmpFile.Seek(0, io.SeekStart); err != nil {
		return "", err
	}

	if err := extractBinary(tmpFile, binPath); err != nil {
		return "", fmt.Errorf("install: extract binary: %w", err)
	}

	logger.Info("greptimedb installed", "path", binPath, "version", resolvedVersion)
	return binPath, nil
}

// resolveVersion resolves "latest" to the actual latest release tag via GitHub API redirect.
func resolveVersion(version string) (string, error) {
	if version != "latest" {
		return version, nil
	}

	// GitHub redirects /releases/latest to the actual tag URL.
	resp, err := http.Get(githubReleaseBase + "/latest")
	if err != nil {
		return "", fmt.Errorf("resolve latest version: %w", err)
	}
	defer resp.Body.Close()

	// After redirect, URL is .../releases/tag/v0.x.y
	finalURL := resp.Request.URL.String()
	parts := strings.Split(finalURL, "/")
	tag := parts[len(parts)-1]
	if tag == "" || !strings.HasPrefix(tag, "v") {
		return "", fmt.Errorf("resolve latest: unexpected URL %s", finalURL)
	}
	return tag, nil
}

// buildDownloadURL constructs the download URL for the current OS/arch.
func buildDownloadURL(version string) (string, error) {
	goos := runtime.GOOS
	goarch := runtime.GOARCH

	// Map Go arch names to GreptimeDB release names.
	var osStr, archStr string
	switch goos {
	case "darwin":
		osStr = "darwin"
	case "linux":
		osStr = "linux"
	default:
		return "", fmt.Errorf("install: unsupported OS %q", goos)
	}
	switch goarch {
	case "amd64":
		archStr = "amd64"
	case "arm64":
		archStr = "arm64"
	default:
		return "", fmt.Errorf("install: unsupported arch %q", goarch)
	}

	// Example: greptime-darwin-arm64-v0.12.0.tar.gz
	filename := fmt.Sprintf("greptime-%s-%s-%s.tar.gz", osStr, archStr, version)
	return fmt.Sprintf("%s/download/%s/%s", githubReleaseBase, version, filename), nil
}

func downloadFile(dst io.Writer, url string) error {
	resp, err := http.Get(url) //nolint:gosec // URL is constructed internally
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d fetching %s", resp.StatusCode, url)
	}

	_, err = io.Copy(dst, resp.Body)
	return err
}

// extractBinary finds the `greptime` binary inside a .tar.gz and writes it to destPath.
func extractBinary(r io.Reader, destPath string) error {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return fmt.Errorf("gzip: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar: %w", err)
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		// The binary is named "greptime" (no extension).
		if filepath.Base(hdr.Name) != "greptime" {
			continue
		}

		out, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			return fmt.Errorf("create binary: %w", err)
		}
		if _, err := io.Copy(out, tr); err != nil {
			out.Close()
			return fmt.Errorf("write binary: %w", err)
		}
		return out.Close()
	}

	return fmt.Errorf("greptime binary not found in archive")
}
