export function print(message = ""): void {
  process.stdout.write(`${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function printError(message: string): void {
  process.stderr.write(`${message}\n`);
}
