export {};

declare global {
  interface Navigator {
    xr?: {
      isSessionSupported?: (mode: string) => Promise<boolean>;
    };
  }
}
