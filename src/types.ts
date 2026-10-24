export type A11yNode = {
  role: string;
  name: string;
  value?: string;
  description?: string;
  states?: Record<string, boolean | number | string>;
  relations?: Record<string, Array<{ role: string; name: string }>>;
  children?: A11yNode[];
};

export type A11yTreePayload = { id: string };
