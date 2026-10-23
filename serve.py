#!/usr/bin/env python3
"""Local dev server for web/ that disables browser caching, so edits show up on reload."""
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    handler = functools.partial(NoCache, directory='web')
    print('http://localhost:8123')
    ThreadingHTTPServer(('', 8123), handler).serve_forever()
