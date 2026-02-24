/**
 * Shared error handling: fatal exits with a user-facing message.
 */

export function fatal(message: string): never {
  console.error(message);
  process.exit(1);
}
