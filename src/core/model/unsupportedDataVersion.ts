export class UnsupportedDataVersionError extends Error {
  readonly name = 'UnsupportedDataVersionError';
  readonly fileVersion: number;
  readonly appVersion: number;

  constructor(fileVersion: number, appVersion: number) {
    super(
      `This workspace file was created with data version ${fileVersion}, but this app only supports up to version ${appVersion}. Update Cadence to open it.`,
    );
    this.fileVersion = fileVersion;
    this.appVersion = appVersion;
  }
}

export function isUnsupportedDataVersionError(err: unknown): err is UnsupportedDataVersionError {
  return err instanceof UnsupportedDataVersionError;
}
