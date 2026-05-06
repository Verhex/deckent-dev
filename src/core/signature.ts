/**
 * Ed25519 Sign/Verify — Deckent cryptographic signature module.
 * Uses @noble/ed25519 (audited, pure JS, no native deps).
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Wire sha512 into ed25519 (required by @noble/ed25519 v2)
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = async (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const KEYPAIR_DIR = join(homedir(), '.deckent', 'keys');

export interface Keypair {
  privateKey: Uint8Array;  // 32 bytes
  publicKey: Uint8Array;   // 32 bytes
}

/**
 * Generate a new Ed25519 keypair (async).
 */
export async function generateKeypair(): Promise<Keypair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return { privateKey, publicKey };
}

/**
 * Load existing keypair from ~/.deckent/keys/ or generate + persist a new one (sync).
 */
export function loadOrGenerateKeypair(keyDir?: string): Keypair {
  const dir = keyDir ?? KEYPAIR_DIR;
  const privPath = join(dir, 'private.hex');
  const pubPath = join(dir, 'public.hex');

  if (existsSync(privPath) && existsSync(pubPath)) {
    return {
      privateKey: ed.etc.hexToBytes(readFileSync(privPath, 'utf-8').trim()),
      publicKey: ed.etc.hexToBytes(readFileSync(pubPath, 'utf-8').trim()),
    };
  }

  // Generate and save
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);

  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(privPath, ed.etc.bytesToHex(privateKey), { mode: 0o600 });
  writeFileSync(pubPath, ed.etc.bytesToHex(publicKey), { mode: 0o644 });

  return { privateKey, publicKey };
}

/**
 * Sign a message with Ed25519 private key. Returns hex-encoded signature.
 */
export async function signMessage(message: Uint8Array | string, privateKey: Uint8Array): Promise<string> {
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const sig = await ed.signAsync(msgBytes, privateKey);
  return ed.etc.bytesToHex(sig);
}

/**
 * Verify an Ed25519 signature. Returns true if valid.
 */
export async function verifySignature(
  message: Uint8Array | string,
  signatureHex: string,
  publicKey: Uint8Array,
): Promise<boolean> {
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const sigBytes = ed.etc.hexToBytes(signatureHex);
  return ed.verifyAsync(sigBytes, msgBytes, publicKey);
}

/**
 * Hex ↔ Bytes utilities (re-exported from @noble/ed25519 for convenience).
 */
export const bytesToHex = ed.etc.bytesToHex;
export const hexToBytes = ed.etc.hexToBytes;

// ─── Skill Signature Helpers ────────────────────────────────────────

export interface VerifySkillResult {
  /** true when signature.ed25519 is present AND verifies against publicKey. */
  readonly valid: boolean;
  /** false when signature.ed25519 file is missing (skill is unsigned). */
  readonly hasSignature: boolean;
  /** Diagnostic explanation — empty when valid is true. */
  readonly reason: string;
}

/**
 * Build the canonical signing payload for a skill. Mirrors the format used by
 * `deckent skill publish` (skill-marketplace.ts:218) so signatures produced by
 * either path verify identically.
 */
export function buildSkillSignPayload(skillContent: string, manifest: unknown): string {
  return skillContent + JSON.stringify(manifest);
}

/**
 * Verify a skill's signature.ed25519 against the supplied hub public key.
 *
 * Returns:
 *   - { valid: true,  hasSignature: true,  reason: '' }                — pass
 *   - { valid: false, hasSignature: false, reason: 'no signature' }   — unsigned
 *   - { valid: false, hasSignature: true,  reason: <explanation> }    — tampered or bad key
 *
 * Callers decide policy: `skill install` rejects { valid: false } unless
 * `--allow-unsigned` is passed. The placeholder format
 * `ed25519:placeholder:…` (used by Sprint 149 seed skills before keygen)
 * is treated as INVALID — Sprint 153 sign-seed-skills.mjs replaces these.
 */
export async function verifySkillSignature(
  skillDir: string,
  publicKey: Uint8Array,
): Promise<VerifySkillResult> {
  const sigPath = join(skillDir, 'signature.ed25519');
  const skillMdPath = join(skillDir, 'SKILL.md');
  const manifestPath = join(skillDir, 'manifest.json');

  if (!existsSync(sigPath)) {
    return { valid: false, hasSignature: false, reason: 'signature.ed25519 missing' };
  }
  const sigRaw = readFileSync(sigPath, 'utf-8').trim();

  // Reject Sprint 149 placeholder format outright
  if (sigRaw.startsWith('ed25519:placeholder')) {
    return { valid: false, hasSignature: true, reason: 'placeholder signature — re-sign with keygen' };
  }

  // Tolerate `ed25519:hub:<pubkey>:<sig>` long form (future format) or bare hex
  let sigHex = sigRaw;
  const colonParts = sigRaw.split(':');
  if (colonParts.length === 4 && colonParts[0] === 'ed25519') {
    sigHex = colonParts[3] ?? '';
  }
  // Sanity: ed25519 sig is 64 bytes = 128 hex chars
  if (!/^[0-9a-fA-F]{128}$/.test(sigHex)) {
    return { valid: false, hasSignature: true, reason: 'malformed signature (expected 128 hex chars)' };
  }

  if (!existsSync(skillMdPath) || !existsSync(manifestPath)) {
    return { valid: false, hasSignature: true, reason: 'SKILL.md or manifest.json missing' };
  }
  const skillContent = readFileSync(skillMdPath, 'utf-8');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const payload = buildSkillSignPayload(skillContent, manifest);

  const ok = await verifySignature(payload, sigHex, publicKey);
  return ok
    ? { valid: true, hasSignature: true, reason: '' }
    : { valid: false, hasSignature: true, reason: 'signature does not match content + hub public key' };
}
