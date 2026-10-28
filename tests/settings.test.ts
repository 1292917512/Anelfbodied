import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Settings } from '../src/host/settings';

describe('connection settings', () => {
  it('loads old settings without a skill and persists or clears a selected skill', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'embodied-settings-')), 'settings.json');
    const original = JSON.stringify({
      version: 1,
      connection: { baseUrl: 'https://agent.example', userId: 'pet', sessionId: 'desk' },
      secret: Buffer.from('saved-token').toString('base64'),
    });
    writeFileSync(file, original);
    const codec = {
      available: () => true,
      encrypt: (text: string) => Buffer.from(text),
      decrypt: (data: Buffer) => data.toString(),
    };
    const settings = new Settings(file, codec);
    expect(settings.get()).toMatchObject({ skillName: '', token: 'saved-token' });
    expect(readFileSync(file, 'utf8')).toBe(original);
    settings.save({ ...settings.get(), skillName: ' anelfbodied-control ' });
    expect(new Settings(file, codec).get()).toEqual({
      ...settings.get(),
      skillName: 'anelfbodied-control',
      token: 'saved-token',
    });
    for (const skillName of ['../skill', 'a,b', 'a b', '[skill:test]', 'a-', 'a'.repeat(65)]) {
      expect(() => settings.save({ ...settings.get(), skillName })).toThrow();
    }
    expect(new Settings(file, codec).get().skillName).toBe('anelfbodied-control');
    settings.save({ ...settings.get(), skillName: '' });
    expect(new Settings(file, codec).get().skillName).toBe('');
  });

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
