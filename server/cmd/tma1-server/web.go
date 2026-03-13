package main

import (
	"net/http"

	"github.com/tma1-ai/tma1/server/web"
)

// webFileSystem returns the embedded web/ directory as an http.FileSystem.
func webFileSystem() http.FileSystem {
	return http.FS(web.FS)
}
