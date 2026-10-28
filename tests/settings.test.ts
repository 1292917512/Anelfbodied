import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Settings } from '../src/host/settings';

describe('connection settings', () => {
  it('preserves encrypted credentials only for the same endpoint and supports explicit removal', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'embodied-settings-')), 'settings.json');
    const codec = {
      available: () => true,
      encrypt: (text: string) => Buffer.from(text.split('').reverse().join('')),
      decrypt: (data: Buffer) => data.toString().split('').reverse().join(''),
    };
    const config = {
      baseUrl: 'https://agent.example',
      token: 'fixture-secret',
      userId: 'pet',
      sessionId: 'desk',
    };
    const settings = new Settings(file, codec);
    settings.save(config);
    expect(readFileSync(file, 'utf8')).not.toContain('fixture-secret');
    expect(new Settings(file, codec).get().token).toBe('fixture-secret');
    settings.save({ ...config, token: '', baseUrl: 'https://agent.example/' });
    expect(settings.get().token).toBe('fixture-secret');
    settings.save({ ...config, token: '', baseUrl: 'https://another.example' });
    expect(settings.get().token).toBe('');
    settings.save(config);
    settings.save({ ...config, token: '', clearToken: true });
    expect(new Settings(file, codec).get().token).toBe('');
  });

  it('keeps credentials in memory when secure storage is unavailable', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'embodied-settings-')), 'settings.json');
    const settings = new Settings(file, {
      available: () => false,
      encrypt: () => {
        throw new Error('No codec');
      },
      decrypt: () => {
        throw new Error('No codec');
      },
    });
    settings.save({
      baseUrl: 'http://localhost:8091',
      token: 'session-only',
      userId: 'pet',
      sessionId: 'desk',
    });
    expect(settings.get().token).toBe('session-only');
    expect(readFileSync(file, 'utf8')).not.toContain('session-only');
  });
});
