export enum Mode {
  PROD = 'Production',
  TEST = 'Test',
}

export interface CommonProps {
  readonly mode: Mode;
  readonly domainName: string;
  readonly domainZone: string;
}
