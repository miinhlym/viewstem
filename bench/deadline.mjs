export class BenchmarkTimeout extends Error {
  constructor(phase, milliseconds) {
    super(`Timed out waiting for ${phase} after ${milliseconds}ms`);
    this.name = 'BenchmarkTimeout';
    this.phase = phase;
    this.milliseconds = milliseconds;
  }
}

export async function withDeadline(value, phase, milliseconds, onTimeout) {
  let timer;
  try {
    return await Promise.race([
      value,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new BenchmarkTimeout(phase, milliseconds));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
