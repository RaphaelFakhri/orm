import type { Contract as End } from '../../snapshots/16441c358cf3ca137b5b06e7964d13b1de55cdb464e916e1fbe2a1926e977a48/contract';
import endContract from '../../snapshots/16441c358cf3ca137b5b06e7964d13b1de55cdb464e916e1fbe2a1926e977a48/contract.json' with {
  type: 'json',
};

export const contracts = { start: null, end: endContract };
export type Contracts = { start: never; end: End };
