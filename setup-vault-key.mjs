// Sets up vault key for admin — run once with: node setup-vault-key.mjs
import { webcrypto } from 'node:crypto';
const crypto = webcrypto;

const SUPABASE_URL     = 'https://cqrfboirwwnlmpzfdbyl.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxcmZib2lyd3dubG1wemZkYnlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDE1MDA1MSwiZXhwIjoyMDY1NzI2MDUxfQ.OhIa_aYv2X6HkbWuRT_2v7Z2yXOgr0G7VFLu5gv0QIw';
const ADMIN_EMAIL      = 'shailja.dwivedi@fello.ai';
const VAULT_KEY_PW     = 'innovations_gtmaifello@2026';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

// ── helpers ──────────────────────────────────────────────────────────
const toB64   = buf => Buffer.from(buf).toString('base64');
const fromB64 = b64 => Uint8Array.from(Buffer.from(b64, 'base64'));

async function deriveKey(password, salt, extractable = false) {
  const enc = new TextEncoder();
  const km  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

// ── 1. Get admin's user_id and existing pbkdf2_salt ──────────────────
console.log('Fetching admin user_settings...');
const settingsRes = await fetch(
  `${SUPABASE_URL}/rest/v1/user_settings?select=user_id,pbkdf2_salt,verification_blob&limit=20`,
  { headers }
);
const allSettings = await settingsRes.json();

// Find admin's row by getting their auth user_id
const usersRes = await fetch(
  `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=100`,
  { headers }
);
const { users } = await usersRes.json();
const adminUser  = users.find(u => u.email === ADMIN_EMAIL);
if (!adminUser) { console.error('Admin user not found in auth.users'); process.exit(1); }

console.log('Admin user_id:', adminUser.id);

const adminSettings = allSettings.find(r => r.user_id === adminUser.id);

// ── 2. Determine salt (use existing if available, generate new if not) ─
let salt;
if (adminSettings?.pbkdf2_salt) {
  salt = fromB64(adminSettings.pbkdf2_salt);
  console.log('Using existing pbkdf2_salt:', adminSettings.pbkdf2_salt);
} else {
  salt = crypto.getRandomValues(new Uint8Array(16));
  console.log('Generated new pbkdf2_salt:', toB64(salt));
}

// ── 3. Derive vault key ──────────────────────────────────────────────
console.log('Deriving vault key from password...');
const vaultKey = await deriveKey(VAULT_KEY_PW, salt, true /* extractable */);

// ── 4. Create verification blob ──────────────────────────────────────
const { iv: verificationIv, ct: verificationBlob } = await encrypt(vaultKey, 'billflow-vault-verified');
console.log('Verification blob created.');

// ── 5. Generate member access key and wrap vault key ─────────────────
const memberAK  = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
const rawVK     = await crypto.subtle.exportKey('raw', vaultKey);
const wrapIv    = crypto.getRandomValues(new Uint8Array(12));
const wrappedVK = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, memberAK, rawVK);
const rawMAK    = await crypto.subtle.exportKey('raw', memberAK);
console.log('Member access key + wrapped vault key generated.');

// ── 6. Upsert user_settings ──────────────────────────────────────────
const payload = {
  user_id:              adminUser.id,
  pbkdf2_salt:          toB64(salt),
  verification_blob:    verificationBlob,
  verification_iv:      verificationIv,
  is_admin_settings:    true,
  role:                 'admin',
  member_access_key:    toB64(new Uint8Array(rawMAK)),
  wrapped_vault_key:    toB64(new Uint8Array(wrappedVK)),
  wrapped_vault_key_iv: toB64(wrapIv),
};

const upsertRes = await fetch(
  `${SUPABASE_URL}/rest/v1/user_settings`,
  {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(payload),
  }
);

if (upsertRes.ok || upsertRes.status === 201) {
  console.log('\n✅ Done! Vault key set successfully.');
  console.log('   Vault password: innovations_gtmaifello@2026');
  console.log('   You can now sign in via Master Password or OTP.');
} else {
  const body = await upsertRes.text();
  console.error('\n❌ Failed to upsert user_settings:', upsertRes.status, body);
}
