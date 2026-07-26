export async function retryTarget<T>(operation: () => Promise<T>): Promise<T> {
  let latestError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      latestError = error;
    }
  }

  throw latestError;
}
