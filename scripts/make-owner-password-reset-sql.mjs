import { randomBytes, scryptSync } from "crypto";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

const email = "aadilsayyed7383@gmail.com";
const rl = createInterface({ input, output });
const password = await rl.question("Enter new dashboard password (12+ chars, upper- and lower-case letters, and a number): ");
rl.close();

if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
  console.error("Password must use at least 12 characters with upper- and lower-case letters and a number.");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const escapedEmail = email.replaceAll("'", "''");
const escapedHash = hash.replaceAll("'", "''");

console.log("\nCopy this SQL into Supabase SQL Editor and run it:\n");
console.log(`UPDATE "User" SET "passwordHash" = '${escapedHash}', "active" = true WHERE "email" = '${escapedEmail}';`);
console.log("\nThen login with:");
console.log(`Email: ${email}`);
console.log("Password: the new password you just typed");
