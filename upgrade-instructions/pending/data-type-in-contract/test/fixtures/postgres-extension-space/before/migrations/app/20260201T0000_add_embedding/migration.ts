import type { Contract as Start } from '../../snapshots/16441c358cf3ca137b5b06e7964d13b1de55cdb464e916e1fbe2a1926e977a48/contract';
import startContract from '../../snapshots/16441c358cf3ca137b5b06e7964d13b1de55cdb464e916e1fbe2a1926e977a48/contract.json' with {
  type: 'json',
};
import type { Contract as End } from '../../snapshots/d8fbfe65ae8dcddc900563312c0b653997c4001d39cdfcb3387ce570d9c758c0/contract';
import endContract from '../../snapshots/d8fbfe65ae8dcddc900563312c0b653997c4001d39cdfcb3387ce570d9c758c0/contract.json' with {
  type: 'json',
};

export const contracts = { start: startContract, end: endContract };
export type Contracts = { start: Start; end: End };
