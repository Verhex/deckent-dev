#!/usr/bin/env node
/**
 * sign-seed-skills.mjs — Ed25519 sign every skill under deckent-hub/skills/
 *
 * Sprint 153 Beta GA Gate #15: 20 seed skills are published but carry only
 * placeholder signature strings (`ed25519:placeholder:awaiting-...`). This
 * script generates (or loads) the Hub keypair from `~/.deckent/keys/` and
 * writes a real ed25519 signature.ed25519 file next to each manifest.json.
 *
 * The signing payload matches `cli/commands/skill-marketplace.ts:publish`:
 *
 *     signPayload = readFile(SKILL.md) + JSON.stringify(manifest)
 *     signature   = ed25519.sign(privateKey, signPayload)  // hex-encoded
 *
 * Output format: signature.ed25519 contains JUST the hex signature string
 * (no `ed25519:` prefix). The hub public key is exposed via stdout so it
 * can be embedded in `skill install` verifier config.
 *
 * Run from project root:
 *   node scripts/sign-seed-skills.mjs            # uses ~/.deckent/keys/
 *   node scripts/sign-seed-skills.mjs --dry-run  # print what would be signed
 *   node scripts/sign-seed-skills.mjs --key-dir /tmp/test-keys
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadOrGenerateKeypair, signMessage, bytesToHex } from '../dist/core/signature.js';

const HUB_DIR = resolve(process.cwd(), 'deckent-hub', 'skills');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const keyDirIdx = args.indexOf('--key-dir');
const keyDir = keyDirIdx >= 0 ? args[keyDirIdx + 1] : undefined;

function findSkillDirs(root) {
  if (!existsSync(root)) {
    console.error(`error: hub directory not found: ${root}`);
    console.error('Run from project root (where deckent-hub/ lives).');
    process.exit(1);
  }
  return readdirSync(root)
    .map((name) => join(root, name))
    .filter((p) => statSync(p).isDirectory())
    .filter((p) => existsSync(join(p, 'manifest.json')) && existsSync(join(p, 'SKILL.md')));
}

async function main() {
  const skills = findSkillDirs(HUB_DIR);
  if (skills.length === 0) {
    console.error(`error: no skills found under ${HUB_DIR}`);
    process.exit(1);
  }
  console.log(`Found ${skills.length} skills under ${HUB_DIR}`);

  const keypair = loadOrGenerateKeypair(keyDir);
  const pubHex = bytesToHex(keypair.publicKey);
  console.log(`Hub public key: ${pubHex}`);
  console.log(`(record this for skill-install verifier; private key stays in ${keyDir ?? '~/.deckent/keys/'})`);
  console.log();

  let signed = 0;
  let skipped = 0;
  for (const dir of skills) {
    const id = dir.split('/').pop();
    const skillContent = readFileSync(join(dir, 'SKILL.md'), 'utf-8');
    const manifestRaw = readFileSync(join(dir, 'manifest.json'), 'utf-8');
    // Re-stringify with the same JSON.stringify(...) used by publish to keep the
    // signing payload byte-identical. JSON.parse → stringify drops formatting.
    const manifest = JSON.parse(manifestRaw);
    const signPayload = skillContent + JSON.stringify(manifest);
    const signature = await signMessage(signPayload, keypair.privateKey);

    const sigPath = join(dir, 'signature.ed25519');
    if (dryRun) {
      console.log(`[dry-run] ${id} → ${signature.slice(0, 16)}...`);
    } else {
      writeFileSync(sigPath, signature);
      console.log(`signed ${id}: ${signature.slice(0, 16)}... → ${sigPath}`);
    }
    signed++;
  }

  console.log();
  console.log(`Done: ${signed} signed${dryRun ? ' (dry-run)' : ''}, ${skipped} skipped`);
  if (!dryRun) {
    console.log(`\nNext: embed hub public key in install verifier config:`);
    console.log(`  ${pubHex}`);
  }
}

main().catch((err) => {
  console.error('error:', err.message);
  process.exit(1);
});
