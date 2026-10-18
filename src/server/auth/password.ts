import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | undefined;

/** Burns the same bcrypt work when the email is unknown, so timing doesn't reveal which accounts exist. */
export async function verifyAgainstDummy(plain: string): Promise<false> {
  dummyHash ??= bcrypt.hash("fieldnote-timing-equalizer", COST);
  await bcrypt.compare(plain, await dummyHash);
  return false;
}
