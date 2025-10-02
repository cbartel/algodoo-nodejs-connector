import { describe, it, expect } from 'vitest';
import path from 'path';
import { contentTypeFor, safeJoin, extractHostname, isLocalhost } from '../src/http-utils';

describe('httpUtils', () => {
  it('contentTypeFor returns expected types', () => {
    expect(contentTypeFor('index.html')).toMatch(/text\/html/);
    expect(contentTypeFor('main.js')).toMatch(/javascript/);
    expect(contentTypeFor('styles.css')).toMatch(/text\/css/);
    expect(contentTypeFor('image.svg')).toBe('image/svg+xml');
    expect(contentTypeFor('image.png')).toBe('image/png');
    expect(contentTypeFor('image.jpg')).toBe('image/jpeg');
    expect(contentTypeFor('data.json')).toMatch(/application\/json/);
    expect(contentTypeFor('file.bin')).toBeUndefined();
  });

  it('safeJoin prevents traversal outside base', () => {
    const base = path.resolve('/tmp/base');
    expect(safeJoin(base, '/assets/app.js')?.startsWith(base)).toBe(true);
    expect(safeJoin(base, '/../etc/passwd')).toBeNull();
  });

  it('extractHostname parses IPv6 and host:port', () => {
    expect(extractHostname('localhost:8080')).toBe('localhost');
    expect(extractHostname('[::1]:8080')).toBe('::1');
    expect(extractHostname('[2001:db8::1]')).toBe('2001:db8::1');
    expect(extractHostname('example.com')).toBe('example.com');
  });

  it('isLocalhost checks common forms', () => {
    expect(isLocalhost('localhost')).toBe(true);
    expect(isLocalhost('127.0.0.1')).toBe(true);
    expect(isLocalhost('::1')).toBe(true);
    expect(isLocalhost('example.com')).toBe(false);
  });
});
